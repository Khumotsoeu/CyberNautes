# server/models.py
from sqlalchemy import Column, Integer, String, JSON, DateTime
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()

class EventRecord(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    install_id = Column(String, index=True)
    kind = Column(String)
    level = Column(String, nullable=True)
    path = Column(String, nullable=True)
    method = Column(String, nullable=True)
    message = Column(String, nullable=True)
    payload = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
