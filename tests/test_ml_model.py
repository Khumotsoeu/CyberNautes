# tests/test_ml_model.py
import pytest
import numpy as np
from types import SimpleNamespace
from sqlalchemy.orm import Session

from server.ml_model import ThreatModel

class DummyDB(Session):
    """Minimal fake DB session with only .query().all()."""
    def __init__(self, events):
        self._events = events

    def query(self, model):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def limit(self, n):
        return self

    def all(self):
        return self._events

def make_event(kind="console", message="hello", duration=5):
    return SimpleNamespace(payload={"kind": kind, "message": message, "durationMs": duration})

def test_featurize_console_and_error():
    model = ThreatModel()
    events = [
        {"kind": "console", "message": "abc"},
        {"kind": "runtime_error", "error": "boom"}
    ]
    X = model._featurize(events)
    assert isinstance(X, np.ndarray)
    assert X.shape[0] == 2
    assert X.shape[1] == 3  # features: kind_idx, msg_len, duration

def test_train_and_predict(tmp_path, monkeypatch):
    # Use tmp_path for model.pkl isolation
    monkeypatch.setattr("server.ml_model.MODEL_FILE", tmp_path / "model.pkl")

    events = [make_event(kind="console", message="ok"),
              make_event(kind="login_attempt"),
              make_event(kind="client_request", duration=12)] * 5
    db = DummyDB(events)

    model = ThreatModel()
    used = model.train(db, limit=20)
    assert used > 0
    assert model.exists()

    preds = model.predict([{"kind": "console", "message": "test"}])
    assert all(p in (-1, 1) for p in preds)

def test_predict_without_training(tmp_path, monkeypatch):
    monkeypatch.setattr("server.ml_model.MODEL_FILE", tmp_path / "missing.pkl")
    model = ThreatModel()
    with pytest.raises(FileNotFoundError):
        model.predict([{"kind": "console", "message": "hi"}])
