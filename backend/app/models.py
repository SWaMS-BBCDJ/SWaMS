from datetime import datetime
from app import db

class Pond(db.Model):
    __tablename__ = "ponds"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    location = db.Column(db.String(120), default="Claveria, Misamis Oriental")
    readings = db.relationship("Reading", backref="pond", lazy=True)

class Reading(db.Model):
    __tablename__ = "readings"
    id = db.Column(db.Integer, primary_key=True)
    pond_id = db.Column(db.Integer, db.ForeignKey("ponds.id"), nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    ph = db.Column(db.Float)
    temperature = db.Column(db.Float)
    turbidity = db.Column(db.Float)
    is_anomalous = db.Column(db.Boolean, default=False)

class Threshold(db.Model):
    __tablename__ = "thresholds"
    id = db.Column(db.Integer, primary_key=True)
    parameter = db.Column(db.String(20), unique=True, nullable=False)
    safe_min = db.Column(db.Float)
    safe_max = db.Column(db.Float)

class AlertLog(db.Model):
    __tablename__ = "alert_logs"
    id = db.Column(db.Integer, primary_key=True)
    reading_id = db.Column(db.Integer, db.ForeignKey("readings.id"))
    parameter = db.Column(db.String(20))
    value = db.Column(db.Float)
    message = db.Column(db.String(255))
    sent_at = db.Column(db.DateTime, default=datetime.utcnow)
