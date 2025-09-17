# server/ml_model.py
"""
Baseline anomaly detector for AI Threat Guard.
- Uses scikit-learn IsolationForest
- Trains from events in the DB
- Persists model to model.pkl
"""

import os
import pathlib
import joblib
import numpy as np
from sklearn.ensemble import IsolationForest
from sqlalchemy.orm import Session
from server.models import EventRecord # import the ORM model

MODEL_FILE = pathlib.Path(__file__).with_name("model.pkl")

class ThreatModel:
    def __init__(self):
        self.model = None

    def _featurize(self, events):
        """
        Convert list of event dicts into numeric feature matrix.
        Very simple baseline: kind encoding + message length/duration if present.
        """
        feats = []
        kind_map = {
            "console": 0,
            "runtime_error": 1,
            "login_attempt": 2,
            "client_request": 3,
            "net_completed": 4,
            "net_error": 5,
            "cookie_change": 6,
        }
        for evt in events:
            kind = evt.get("kind")
            kind_idx = kind_map.get(kind, 99)
            msg_len = len(str(evt.get("message") or evt.get("error") or "")) if kind in ("console", "runtime_error") else 0
            duration = evt.get("durationMs", 0) or 0
            feats.append([kind_idx, msg_len, duration])
        return np.array(feats) if feats else np.zeros((0, 3))

    def train(self, db: Session, limit: int = 1000):
        """
        Train model from latest events in DB.
        Returns number of events used.
        """
        q = db.query(EventRecord).order_by(EventRecord.id.desc()).limit(limit)
        rows = q.all()
        if not rows:
            raise RuntimeError("No events available for training")

        events = [r.payload for r in rows if r.payload]
        X = self._featurize(events)
        if len(X) < 10:
            raise RuntimeError("Not enough events to train")

        self.model = IsolationForest(n_estimators=100, contamination=0.1, random_state=42)
        self.model.fit(X)

        joblib.dump(self.model, MODEL_FILE)
        return len(X)

    def predict(self, events):
        """
        Predict anomaly status for given events.
        Returns list of -1 (anomaly) or 1 (normal).
        """
        if self.model is None and MODEL_FILE.exists():
            self.model = joblib.load(MODEL_FILE)
        if self.model is None:
            raise FileNotFoundError("No trained model found")

        X = self._featurize(events)
        if len(X) == 0:
            return []
        return self.model.predict(X).tolist()

    def exists(self):
        """Check if trained model exists on disk."""
        return MODEL_FILE.exists()

# Singleton
threat_model = ThreatModel()
