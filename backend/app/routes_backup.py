from itsdangerous import URLSafeTimedSerializer
from app.models import User

import math
from datetime import date, datetime, time, timedelta, timezone

from flask import (
    Blueprint,
    current_app,
    jsonify,
    render_template,
    request,
)
from sqlalchemy import func

from app import db
from app.models import AlertLog, Pond, Reading, Threshold
from app.services.thresholds import evaluate, log_alerts


main = Blueprint("main", __name__)


# ==========================================
# ALERT FILTER HELPERS
# ==========================================
def parse_date(value):
    """Parse a YYYY-MM-DD date; return None if invalid."""
    if not value:
        return None

    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def build_alert_query(start_date=None, end_date=None, parameter=None):
    """Build a reusable query for filtered alert records."""
    query = AlertLog.query

    if start_date:
        start_datetime = datetime.combine(start_date, time.min)
        query = query.filter(AlertLog.sent_at >= start_datetime)

    if end_date:
        # Exclusive next-day boundary includes the entire end date.
        end_datetime = datetime.combine(
            end_date + timedelta(days=1),
            time.min,
        )
        query = query.filter(AlertLog.sent_at < end_datetime)

    if parameter and parameter.lower() in {
        "ph", "temperature", "turbidity"
    }:
        query = query.filter(
            func.lower(AlertLog.parameter) == parameter.lower()
        )

    return query


def get_alert_date_range():
    """
    Supported modes:
      today
      7days
      28days
      custom

    Custom mode expects from=YYYY-MM-DD and to=YYYY-MM-DD.
    Dates use the server's local calendar date.
    """
    today = date.today()
    period = request.args.get("period", "7days").strip().lower()

    if period == "today":
        return today, today, None

    if period == "7days":
        return today - timedelta(days=6), today, None

    if period == "28days":
        return today - timedelta(days=27), today, None

    if period == "custom":
        start_date = parse_date(request.args.get("from"))
        end_date = parse_date(request.args.get("to"))

        if not start_date or not end_date:
            return None, None, "Custom range requires valid from and to dates."

        if start_date > end_date:
            return None, None, "'From' date must be on or before 'To' date."

        if (end_date - start_date).days > 366:
            return None, None, "Please select a date range of 367 days or less."

        return start_date, end_date, None

    return None, None, "Invalid period. Use today, 7days, 28days, or custom."


def serialize_alert(alert):
    """Convert an alert database record to a JSON-safe dictionary."""
    return {
        "id": alert.id,
        "parameter": alert.parameter,
        "value": alert.value,
        "message": alert.message,
        "sent_at": (
            alert.sent_at.isoformat()
            if alert.sent_at else None
        ),
    }


# ==========================================
# DASHBOARD
# ==========================================
@main.get("/")
def dashboard():
    latest_reading = Reading.query.order_by(
        Reading.timestamp.desc(),
        Reading.id.desc(),
    ).first()

    # Pass dictionaries, not SQLAlchemy model objects, to templates.
    thresholds = {
        item.parameter.lower(): {
            "safe_min": item.safe_min,
            "safe_max": item.safe_max,
        }
        for item in Threshold.query.all()
    }

    return render_template(
        "dashboard.html",
        latest_reading=latest_reading,
        thresholds=thresholds,
    )


# ==========================================
# HEALTH CHECK
# ==========================================
@main.get("/api/health")
def health():
    return jsonify(status="ok")


# ==========================================
# LATEST SENSOR READING
# ==========================================
@main.get("/api/readings/latest")
def latest():
    reading = Reading.query.order_by(
        Reading.timestamp.desc(),
        Reading.id.desc(),
    ).first()

    if reading is None:
        return jsonify(
            readings=[],
            message="no data yet",
        )

    return jsonify(
        ph=reading.ph,
        temperature=reading.temperature,
        turbidity=reading.turbidity,
        timestamp=reading.timestamp.isoformat(),
        is_anomalous=bool(reading.is_anomalous),
    )


# ==========================================
# HISTORICAL SENSOR READINGS
# ==========================================
@main.get("/api/readings/history")
def history():
    rows = Reading.query.order_by(
        Reading.timestamp.desc(),
        Reading.id.desc(),
    ).limit(500).all()

    # Chart expects oldest-to-newest ordering.
    rows.reverse()

    return jsonify([
        {
            "t": reading.timestamp.isoformat(),
            "ph": reading.ph,
            "temperature": reading.temperature,
            "turbidity": reading.turbidity,
        }
        for reading in rows
    ])


# ==========================================
# FILTERED ALERT HISTORY API
# ==========================================
@main.get("/api/alerts")
def alerts():
    """
    Examples:
      /api/alerts?period=today
      /api/alerts?period=7days
      /api/alerts?period=28days
      /api/alerts?period=custom&from=2026-10-01&to=2026-10-19

    Optional parameters:
      parameter=ph|temperature|turbidity
      page=1
      per_page=10
    """
    start_date, end_date, error = get_alert_date_range()

    if error:
        return jsonify(error=error), 400

    parameter = request.args.get("parameter", "").strip().lower()

    try:
        page = max(1, int(request.args.get("page", 1)))
        per_page = int(request.args.get("per_page", 10))
    except (TypeError, ValueError):
        return jsonify(error="page and per_page must be integers"), 400

    # Prevent unexpectedly large responses.
    per_page = min(max(per_page, 1), 100)

    query = build_alert_query(
        start_date=start_date,
        end_date=end_date,
        parameter=parameter,
    )

    total = query.count()

    records = query.order_by(
        AlertLog.sent_at.desc(),
        AlertLog.id.desc(),
    ).offset((page - 1) * per_page).limit(per_page).all()

    return jsonify(
        alerts=[serialize_alert(alert) for alert in records],
        total=total,
        page=page,
        per_page=per_page,
        total_pages=(total + per_page - 1) // per_page,
        period=request.args.get("period", "7days").lower(),
        start_date=start_date.isoformat() if start_date else None,
        end_date=end_date.isoformat() if end_date else None,

        query = build_alert_query(
            start_date=start_date,
            end_date=end_date,
            parameter=parameter,
        )
    )


# ==========================================
# RECEIVE SENSOR DATA FROM ESP32
# ==========================================
@main.post("/api/readings")
def ingest():
    key = request.headers.get("X-Device-Key")

    if key != current_app.config["DEVICE_API_KEY"]:
        return jsonify(error="unauthorized"), 401

    data = request.get_json(silent=True) or {}

    try:
        ph = float(data["ph"])
        temperature = float(data["temperature"])
        turbidity = float(data["turbidity"])
    except (KeyError, TypeError, ValueError):
        return jsonify(
            error="ph, temperature and turbidity are required numbers"
        ), 400

    # Reject NaN and infinity.
    if not all(math.isfinite(value) for value in (
        ph, temperature, turbidity
    )):
        return jsonify(
            error="sensor values must be finite numbers"
        ), 400

    if not 0 <= ph <= 14:
        return jsonify(error="ph out of physical range"), 400

    if not -10 <= temperature <= 60:
        return jsonify(
            error="temperature out of physical range"
        ), 400

    if turbidity < 0:
        return jsonify(
            error="turbidity cannot be negative"
        ), 400

    pond = Pond.query.first()

    if pond is None:
        return jsonify(error="no pond configured"), 409

    reading = Reading(
        pond_id=pond.id,
        timestamp=datetime.now(timezone.utc).replace(tzinfo=None),
        ph=ph,
        temperature=temperature,
        turbidity=turbidity,
    )

    db.session.add(reading)
    db.session.flush()

    breaches = evaluate({
        "ph": ph,
        "temperature": temperature,
        "turbidity": turbidity,
    })

    reading.is_anomalous = bool(breaches)

    log_alerts(reading, breaches, db)

    db.session.commit()

    return jsonify(
        id=reading.id,
        is_anomalous=reading.is_anomalous,
        breaches=breaches,
        alerts=[
            breach["parameter"]
            for breach in breaches
        ],
    ), 201


# ==========================================
# USER AUTHENTICATION
# ==========================================
@main.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}

    username = str(data.get("username", "")).strip()
    password = data.get("password", "")

    if not username or not isinstance(password, str) or not password:
        return jsonify(message="Username and password are required"), 400

    user = User.query.filter_by(username=username).first()

    if user is None or not user.check_password(password):
        return jsonify(message="Invalid username or password"), 401

    serializer = URLSafeTimedSerializer(
        current_app.config["SECRET_KEY"],
        salt="swams-auth"
    )

    token = serializer.dumps({"user_id": user.id})

    return jsonify(
    message="Login successful",
    token=token,
    user={
        "id": user.id,
        "username": user.username,
        "role": user.role
        }
    ), 200