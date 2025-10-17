# server/server.py
import os
import logging
from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker, Session
from pydantic import BaseModel
from pydantic import ConfigDict
from typing import List, Optional
from datetime import datetime, timedelta

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
    # Allow extra fileds so we can persiis tfull event payload
    model_config = ConfigDict(extra="allow")

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
        # Persist the entier event so we dont lose any data (fields)
        try:
            event_payload = ev.model_dump()
        except Exception :
            # Fallback for any parsing edge case
            event_payload = {" kind": ev.kind, "message": ev.message, "path": ev.path, "method": ev.method}

        record = EventRecord(
            install_id=req.installId,
            kind=ev.kind,
            level=ev.level,
            path=ev.path,
            method=ev.method,
            message=ev.message,
            payload=event_payload,
        )
        db.add(record)
    db.commit()

    # Log kinds of test visibility
    for ev in req.events:
        try:
            logging.info("event kind=%s", ev.kind)
        except Exception:
                pass
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

#---------------------------------------------------
# Reporting / Dashboard endpoints could go here
#---------------------------------------------------

@app.get("/dashboard/stats")
def dashboard_stats(db: Session = Depends(get_db)):
    """Basic stats for dashboard view."""
    total_events = db.query(func.count(EventRecord.id)).scalar() or 0

    # Counts per kind (all-time)
    rows = (
        db.query(EventRecord, func.count(EventRecord.id))
        .group_by(EventRecord.kind)
        .all()
    )
    by_kind = {k or "unknown": c for (k, c) in rows}

    # Last 24 hours total
    since = datetime.utcnow() - timedelta(hours=24)
    last_24h = (
        db.query(func.count(EventRecord.id))
        .filter(EventRecord.created_at >= since)
        .scalar()
        or 0
    )

    return {
        "total_events": total_events,
        "by_kind": by_kind,
        "last_24h": last_24h,
    }
    

@app.get("/reports/daily")
def reports_daily(days: int = 7, db: Session = Depends(get_db)):
    """Daily counts per kind for the last N days (default 7)."""
    days = max(1, min(days, 90))
    since = datetime.utcnow() - timedelta(days=days)

    # SQLite and Postgress both understand DATE(column) in GROUP BY
    day_col = func.date(EventRecord.created_at)
    rows = (
        db.query(day_col.label("day"), EventRecord.kind, func.count(EventRecord.id).label("count"))
        .filter(EventRecord.created_at >= since)
        .group_by("day", EventRecord.kind)
        .order_by("day")
        .all()
    )
        
    # Shape into list od {day: 'YYYY-MM-DD', counts: {kind: n, ...}}
    series = {}
    for day, kind, count in rows:
        key = str(day)
        series.setdefault(key, {})[kind or "unknown"] = count
        out = [
            {"day": day, "counts": series[day], "total": sum(series[day].values())}
            for day in sorted(series.keys())
        ]
        return {"days": out}
    

# -------------------------------------------------
# Run server directly
# -------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server.server:app", host="0.0.0.0", port=8000, reload=True)
