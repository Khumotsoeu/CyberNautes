# server/server.py
import os
import logging
from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

from server.models import Base, EventRecord  # ✅ moved models out
from server.ml_model import threat_model     # ✅ safe import now

# -------------------------------------------------
# Database setup
# -------------------------------------------------
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./server/events.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create tables
Base.metadata.create_all(bind=engine)

# -------------------------------------------------
# FastAPI app
# -------------------------------------------------
app = FastAPI(title="AI Threat Guard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------
# Logging setup
# -------------------------------------------------
logging.basicConfig(
    filename="server/ingest.log",
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s"
)

# -------------------------------------------------
# Dependency
# -------------------------------------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# -------------------------------------------------
# API Key handling
# -------------------------------------------------
API_KEY = os.getenv("INGEST_API_KEY")

def verify_api_key(x_api_key: str = Header(...)):
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API key")

# -------------------------------------------------
# Pydantic Schemas
# -------------------------------------------------
class Event(BaseModel):
    kind: str
    level: Optional[str] = None
    path: Optional[str] = None
    method: Optional[str] = None
    message: Optional[str] = None
    payload: Optional[dict] = None

class IngestRequest(BaseModel):
    installId: str
    events: List[Event]

class IngestResponse(BaseModel):
    ok: bool
    received: int

class PredictRequest(BaseModel):
    events: List[Event]

class PredictResponse(BaseModel):
    results: List[int]

class TrainResponse(BaseModel):
    ok: bool
    trained_on: int

class ModelStatusResponse(BaseModel):
    exists: bool
    last_trained: Optional[str]
    total_events: int

# -------------------------------------------------
# Endpoints
# -------------------------------------------------
@app.post("/ingest", response_model=IngestResponse, dependencies=[Depends(verify_api_key)])
def ingest(req: IngestRequest, db: Session = Depends(get_db)):
    for ev in req.events:
        record = EventRecord(
            install_id=req.installId,
            kind=ev.kind,
            level=ev.level,
            path=ev.path,
            method=ev.method,
            message=ev.message,
            payload=ev.payload,
        )
        db.add(record)
    db.commit()

    logging.info("Ingested %d events from %s", len(req.events), req.installId)

    # Auto-retrain trigger
    total = db.query(EventRecord).count()
    if total % threat_model.retrain_interval == 0:
        threat_model.train(db)

    return {"ok": True, "received": len(req.events)}

@app.post("/predict", response_model=PredictResponse, dependencies=[Depends(verify_api_key)])
def predict(req: PredictRequest):
    results = threat_model.predict(req.events)
    return {"results": results}

@app.post("/train", response_model=TrainResponse, dependencies=[Depends(verify_api_key)])
def train(db: Session = Depends(get_db)):
    n = threat_model.train(db)
    return {"ok": True, "trained_on": n}

@app.get("/model/status", response_model=ModelStatusResponse, dependencies=[Depends(verify_api_key)])
def model_status(db: Session = Depends(get_db)):
    meta = threat_model.get_meta(db)
    return {
        "exists": threat_model.is_trained(),
        "last_trained": meta.get("last_trained"),
        "total_events": db.query(EventRecord).count()
    }

# -------------------------------------------------
# Run server directly
# -------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server.server:app", host="0.0.0.0", port=8000, reload=True)
