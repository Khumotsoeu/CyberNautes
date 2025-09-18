# server/server.py
"""
AI Threat Guard - Ingest + ML
FastAPI backend with persistence, API-key auth, rate limiting, anomaly detection.

Features:
- /ingest: store events in DB + log file
- /predict: run anomaly detection on incoming events
- /train: retrain anomaly detection model
- /model/status: inspect model existence, last trained timestamp, total ingested events
"""

import os
import json
import pathlib
import secrets
import datetime
import threading
from typing import List, Dict, Any, Optional

from fastapi import FastAPI, Depends, HTTPException, Header, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import (
    create_engine, Column, Integer, String, DateTime, Boolean, JSON as SAJSON
)
from sqlalchemy.orm import declarative_base, sessionmaker, Session

from server.ml_model import threat_model  # our anomaly detector singleton

# --- Configuration ---
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./server/events.db")
LOG_FILE = pathlib.Path(__file__).with_name("ingest.log")
RATE_LIMIT_PER_MIN = int(os.getenv("RATE_LIMIT_PER_MIN", "120"))

# --- SQLAlchemy setup ---
Base = declarative_base()
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
    future=True,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# --- Models ---
class APIKey(Base):
    __tablename__ = "api_keys"
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(128), unique=True, index=True, nullable=False)
    name = Column(String(256), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    revoked = Column(Boolean, default=False)

class EventRecord(Base):
    __tablename__ = "events"
    id = Column(Integer, primary_key=True, index=True)
    install_id = Column(String(128), index=True, nullable=True)
    kind = Column(String(128), index=True, nullable=True)
    payload = Column(SAJSON, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)

# --- App ---
app = FastAPI(title="AI Threat Guard - Ingest")
Base.metadata.create_all(bind=engine)

# --- Globals for model tracking ---
last_trained_at: Optional[datetime.datetime] = None
total_ingested_events: int = 0

# --- Rate limiter ---
_rate_lock = threading.Lock()
_rate_state: Dict[str, Dict[str, Any]] = {}

def check_rate_limit(key: str):
    with _rate_lock:
        now = int(datetime.datetime.utcnow().timestamp())
        window_start = now - (now % 60)
        state = _rate_state.get(key)
        if state is None or state.get("window_start") != window_start:
            _rate_state[key] = {"window_start": window_start, "count": 1}
            return
        if state["count"] >= RATE_LIMIT_PER_MIN:
            raise HTTPException(status_code=429, detail="Rate limit exceeded")
        state["count"] += 1

# --- DB dependency ---
def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- Auth dependency ---
async def require_api_key(x_api_key: Optional[str] = Header(None), db: Session = Depends(get_db)):
    if not x_api_key:
        raise HTTPException(status_code=401, detail="Missing X-API-Key header")
    api = db.query(APIKey).filter(APIKey.key == x_api_key, APIKey.revoked == False).first()
    if not api:
        raise HTTPException(status_code=401, detail="Invalid or revoked API key")
    check_rate_limit(x_api_key)
    return api

# --- Schemas ---
class IngestPayload(BaseModel):
    installId: str = Field(..., alias="installId")
    events: List[Dict[str, Any]]

class PredictPayload(BaseModel):
    installId: str = Field(..., alias="installId")
    events: List[Dict[str, Any]]

class PredictResponse(BaseModel):
    results: List[int]

# --- Endpoints ---

@app.post("/ingest")
async def ingest(p: IngestPayload, api: APIKey = Depends(require_api_key), db: Session = Depends(get_db)):
    global total_ingested_events
    created_objs = []
    for evt in p.events:
        rec = EventRecord(install_id=p.installId, kind=evt.get("kind"), payload=evt)
        db.add(rec)
        created_objs.append(rec)
    db.commit()
    total_ingested_events += len(p.events)

    try:
        with open(LOG_FILE, "a") as f:
            for evt in p.events:
                f.write(json.dumps(evt) + "\n")
    except Exception:
        pass

    return {"ok": True, "received": len(p.events)}

@app.post("/predict", response_model=PredictResponse)
async def predict(p: PredictPayload, api: APIKey = Depends(require_api_key)):
    try:
        results = threat_model.predict(p.events)
        return {"results": results}
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="No trained model available")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {e}")

@app.post("/train")
async def train(api: APIKey = Depends(require_api_key), db: Session = Depends(get_db)):
    global last_trained_at
    events = db.query(EventRecord).all()
    data = [e.payload for e in events]
    if not data:
        raise HTTPException(status_code=400, detail="No events available to train")
    threat_model.train(data)
    last_trained_at = datetime.datetime.utcnow()
    return {"ok": True, "trained_on": len(data)}

@app.get("/model/status")
async def model_status(api: APIKey = Depends(require_api_key)):
    return {
        "exists": threat_model.exists(),
        "last_trained": last_trained_at.isoformat() if last_trained_at else None,
        "total_events": total_ingested_events,
    }

@app.get("/healthz")
async def health():
    return {"ok": True, "time": datetime.datetime.utcnow().isoformat()}

@app.get("/keys")
async def list_keys(db: Session = Depends(get_db)):
    keys = db.query(APIKey).all()
    return [{"id": k.id, "key": k.key, "name": k.name, "created_at": k.created_at.isoformat(), "revoked": k.revoked} for k in keys]

# --- Helpers ---
def create_default_api_key_if_needed():
    db = SessionLocal()
    try:
        existing = db.query(APIKey).first()
        if existing:
            print("[ingest] found existing API key(s); not creating default.")
            return
        key = secrets.token_urlsafe(32)
        api = APIKey(key=key, name="default-local")
        db.add(api)
        db.commit()
        print("=== AI Threat Guard ingest: created default API key ===")
        print("Use this API key in X-API-Key header when calling /ingest:")
        print(key)
        print("======================================================")
    finally:
        db.close()

# --- Startup ---
if __name__ == "__main__":
    try:
        LOG_FILE.write_text("")
    except Exception as e:
        print("Failed to reset ingest.log:", e)
    create_default_api_key_if_needed()
    import uvicorn
    uvicorn.run("server.server:app", host="0.0.0.0", port=8000, reload=False)
