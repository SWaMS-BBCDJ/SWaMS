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
    warning_min = db.Column(db.Float, nullable=True)
    warning_max = db.Column(db.Float, nullable=True)

class AlertLog(db.Model):
    __tablename__ = "alert_logs"
    id = db.Column(db.Integer, primary_key=True)
    reading_id = db.Column(db.Integer, db.ForeignKey("readings.id"))
    parameter = db.Column(db.String(20))
    value = db.Column(db.Float)
    message = db.Column(db.String(255))
    sent_at = db.Column(db.DateTime, default=datetime.utcnow)



from werkzeug.security import generate_password_hash, check_password_hash

class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="operator")
    mobile_number = db.Column(db.String(20), nullable=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    

class LiveReading(db.Model):
    __tablename__ = "live_readings"

    id = db.Column(db.Integer, primary_key=True)

    pond_id = db.Column(
        db.Integer,
        db.ForeignKey("ponds.id"),
        nullable=False,
        unique=True
    )

    timestamp = db.Column(
        db.DateTime,
        nullable=False,
        default=datetime.utcnow
    )

    ph = db.Column(db.Float, nullable=False)
    temperature = db.Column(db.Float, nullable=False)
    turbidity = db.Column(db.Float, nullable=False)


class HourlyReadingBuffer(db.Model):
    __tablename__ = "hourly_reading_buffer"

    id = db.Column(db.Integer, primary_key=True)

    pond_id = db.Column(
        db.Integer,
        db.ForeignKey("ponds.id"),
        nullable=False
    )

    # Beginning of the Philippine-time hour, stored as UTC
    hour_start = db.Column(db.DateTime, nullable=False)

    ph = db.Column(db.Float, nullable=False)
    temperature = db.Column(db.Float, nullable=False)
    turbidity = db.Column(db.Float, nullable=False)

    __table_args__ = (
        db.UniqueConstraint(
            "pond_id",
            "hour_start",
            name="unique_pond_hour"
        ),
    )


class AlertIncident(db.Model):
    __tablename__ = "alert_incidents"

    id = db.Column(db.Integer, primary_key=True)

    pond_id = db.Column(
        db.Integer,
        db.ForeignKey("ponds.id"),
        nullable=False,
    )

    detected_at = db.Column(db.DateTime, nullable=False)
    last_updated_at = db.Column(db.DateTime, nullable=False)
    acknowledged_at = db.Column(db.DateTime, nullable=True)
    recovered_at = db.Column(db.DateTime, nullable=True)

    status = db.Column(
        db.String(20),
        nullable=False,
        default="ACTIVE",
    )

    parameters = db.relationship(
        "IncidentParameter",
        backref="incident",
        cascade="all, delete-orphan",
        lazy=True,
    )


class IncidentParameter(db.Model):
    __tablename__ = "incident_parameters"

    id = db.Column(db.Integer, primary_key=True)

    incident_id = db.Column(
        db.Integer,
        db.ForeignKey("alert_incidents.id"),
        nullable=False,
    )

    parameter = db.Column(db.String(20), nullable=False)

    first_detected_at = db.Column(db.DateTime, nullable=False)
    last_updated_at = db.Column(db.DateTime, nullable=False)

    latest_value = db.Column(db.Float, nullable=False)
    severity = db.Column(db.String(20), nullable=False)
    direction = db.Column(db.String(10), nullable=False)

    recovered_at = db.Column(db.DateTime, nullable=True)

    __table_args__ = (
        db.UniqueConstraint(
            "incident_id",
            "parameter",
            name="unique_incident_parameter",
        ),
    )


class SMSCommand(db.Model):
    __tablename__ = "sms_commands"

    id = db.Column(db.Integer, primary_key=True)

    incident_id = db.Column(
        db.Integer,
        db.ForeignKey("alert_incidents.id"),
        nullable=True,
    )

    phone_number = db.Column(db.String(20), nullable=False)
    message = db.Column(db.Text, nullable=False)

    status = db.Column(
        db.String(20),
        nullable=False,
        default="PENDING",
        index=True,
    )

    created_at = db.Column(
        db.DateTime,
        nullable=False,
        default=datetime.utcnow,
    )

    sent_at = db.Column(db.DateTime, nullable=True)
