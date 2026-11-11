
from itsdangerous import URLSafeTimedSerializer, BadSignature
from app.models import User
from functools import wraps
import re
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
from app.models import AlertLog, LiveReading, Pond, Reading, Threshold
from app.services.thresholds import evaluate, log_alerts


main = Blueprint("main", __name__)


# ==========================================
# USER AUTHORIZATION
# ==========================================

def get_authenticated_user():
    """Validate the Bearer token and return the authenticated user."""

    auth_header = request.headers.get("Authorization", "")

    if not auth_header.startswith("Bearer "):
        print("AUTH DEBUG: Missing or invalid Authorization header")
        return None, (jsonify(message="Authentication required"), 401)

    token = auth_header.split(" ", 1)[1]

    serializer = URLSafeTimedSerializer(
        current_app.config["SECRET_KEY"],
        salt="swams-auth"
    )

    try:
        data = serializer.loads(token, max_age=28800)
        user = db.session.get(User, data.get("user_id"))

    except BadSignature:
        print("AUTH DEBUG: Invalid or expired token")
        return None, (jsonify(message="Invalid or expired token"), 401)

    if user is None:
        print("AUTH DEBUG: User not found")
        return None, (jsonify(message="User not found"), 401)

    return user, None


def token_required(f):
    """Allow any authenticated user."""

    @wraps(f)
    def decorated(*args, **kwargs):

        user, error = get_authenticated_user()

        if error:
            return error

        print("\n========== TOKEN ACCESS GRANTED ==========")
        print("PATH:", request.path)
        print("ENDPOINT:", request.endpoint)
        print("USER:", user.username)
        print("ROLE:", user.role)
        print("==========================================\n")

        return f(*args, **kwargs)

    return decorated


def admin_required(f):
    """Allow administrators only."""

    @wraps(f)
    def decorated(*args, **kwargs):

        user, error = get_authenticated_user()

        if error:
            return error

        if user.role != "admin":

            print("\n========== ADMIN ACCESS DENIED ==========")
            print("PATH:", request.path)
            print("ENDPOINT:", request.endpoint)
            print("USER:", user.username)
            print("ROLE:", user.role)
            print("=========================================\n")

            return jsonify(message="Admin access required"), 403

        print("\n========== ADMIN ACCESS GRANTED ==========")
        print("PATH:", request.path)
        print("USER:", user.username)
        print("==========================================\n")

        return f(*args, **kwargs)

    return decorated


# ==========================================
# ALERT FILTER HELPERS
# ==========================================

def parse_date(value):
    if not value:
        return None

    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def build_alert_query(start_date=None, end_date=None, parameter=None):

    query = AlertLog.query

    if start_date:
        start_datetime = datetime.combine(start_date, time.min)
        query = query.filter(AlertLog.sent_at >= start_datetime)

    if end_date:
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

    reading = LiveReading.query.order_by(
        LiveReading.timestamp.desc(),
        LiveReading.id.desc(),
    ).first()

    if reading is None:
        return jsonify(
            readings=[],
            message="no live data yet",
        ), 404

    return jsonify(
        ph=reading.ph,
        temperature=reading.temperature,
        turbidity=reading.turbidity,
        timestamp=reading.timestamp.isoformat() + "Z",
        is_anomalous=False,
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

    start_date, end_date, error = get_alert_date_range()

    if error:
        return jsonify(error=error), 400

    parameter = request.args.get("parameter", "").strip().lower()

    try:
        page = max(1, int(request.args.get("page", 1)))
        per_page = int(request.args.get("per_page", 10))

    except (TypeError, ValueError):
        return jsonify(error="page and per_page must be integers"), 400

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

    
    # Current measurement timestamp
    measurement_time = datetime.now(timezone.utc).replace(tzinfo=None)

    # ==========================================
    # 1. UPDATE LIVE READING
    # ==========================================

    live_reading = LiveReading.query.filter_by(
        pond_id=pond.id
    ).first()

    if live_reading is None:
        live_reading = LiveReading(
            pond_id=pond.id,
            timestamp=measurement_time,
            ph=ph,
            temperature=temperature,
            turbidity=turbidity,
        )

        db.session.add(live_reading)

    else:
        live_reading.timestamp = measurement_time
        live_reading.ph = ph
        live_reading.temperature = temperature
        live_reading.turbidity = turbidity

    # ==========================================
    # 2. FIND CURRENT HOURLY RECORD
    # ==========================================

    hour_start = measurement_time.replace(
        minute=0,
        second=0,
        microsecond=0
    )

    hour_end = hour_start + timedelta(hours=1)

    reading = Reading.query.filter(
        Reading.pond_id == pond.id,
        Reading.timestamp >= hour_start,
        Reading.timestamp < hour_end,
    ).first()

    # ==========================================
    # 3. CREATE OR UPDATE HOURLY RECORD
    # ==========================================

    if reading is None:

        reading = Reading(
            pond_id=pond.id,
            timestamp=measurement_time,
            ph=ph,
            temperature=temperature,
            turbidity=turbidity,
        )

        db.session.add(reading)

    else:

        reading.timestamp = measurement_time
        reading.ph = ph
        reading.temperature = temperature
        reading.turbidity = turbidity

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


# ==========================================
# GET THRESHOLDS
# ADMIN AND OPERATOR CAN VIEW
# ==========================================

@main.get("/api/settings/thresholds")
@token_required
def get_threshold_settings():

    thresholds = Threshold.query.all()

    result = {
        item.parameter.lower(): {
            "safe_min": item.safe_min,
            "safe_max": item.safe_max
        }
        for item in thresholds
    }

    return jsonify(result), 200


# ==========================================
# UPDATE THRESHOLDS
# ADMIN ONLY
# ==========================================

@main.put("/api/settings/thresholds")
@admin_required
def update_threshold_settings():

    data = request.get_json(silent=True) or {}

    allowed_parameters = ("ph", "temperature", "turbidity")

    for parameter in allowed_parameters:

        if parameter not in data:
            continue

        values = data[parameter]

        if not isinstance(values, dict):
            return jsonify(message=f"Invalid settings for {parameter}"), 400

        try:
            safe_min = float(values["safe_min"])
            safe_max = float(values["safe_max"])

        except (KeyError, TypeError, ValueError):
            return jsonify(message=f"Invalid range for {parameter}"), 400

        if not math.isfinite(safe_min) or not math.isfinite(safe_max):
            return jsonify(message="Values must be finite numbers"), 400

        if safe_min >= safe_max:
            return jsonify(
                message=f"Minimum must be lower than maximum for {parameter}"
            ), 400

        if parameter == "ph" and (safe_min < 0 or safe_max > 14):
            return jsonify(message="pH must be between 0 and 14"), 400

        if parameter == "temperature" and (
            safe_min < -10 or safe_max > 60
        ):
            return jsonify(message="Invalid temperature range"), 400

        if parameter == "turbidity" and safe_min < 0:
            return jsonify(message="Turbidity cannot be negative"), 400

        threshold = Threshold.query.filter_by(
            parameter=parameter
        ).first()

        if threshold is None:
            threshold = Threshold(parameter=parameter)
            db.session.add(threshold)

        threshold.safe_min = safe_min
        threshold.safe_max = safe_max

    db.session.commit()

    return jsonify(
        message="Threshold settings saved successfully"
    ), 200


# ==========================================
# OPERATOR ACCOUNT HELPER
# ==========================================

def get_operator_account():

    operators = User.query.filter_by(role="operator").all()

    if not operators:
        return None, (
            jsonify(message="No operator account found."),
            404,
        )

    if len(operators) > 1:
        return None, (
            jsonify(
                message="Multiple operator accounts found. "
                        "Please configure which operator receives SMS alerts."
            ),
            409,
        )

    return operators[0], None


# ==========================================
# GET OPERATOR MOBILE NUMBER
# ADMIN ONLY
# ==========================================

@main.get("/api/settings/operator-mobile")
@admin_required
def get_operator_mobile():

    operator, error = get_operator_account()

    if error:
        return error

    return jsonify(
        username=operator.username,
        mobile_number=operator.mobile_number or "",
    ), 200


# ==========================================
# UPDATE OPERATOR MOBILE NUMBER
# ADMIN ONLY
# ==========================================

@main.put("/api/settings/operator-mobile")
@admin_required
def update_operator_mobile():

    data = request.get_json(silent=True) or {}

    mobile_number = str(data.get("mobile_number", "")).strip()

    if not re.fullmatch(r"\+639\d{9}", mobile_number):
        return jsonify(
            message="Enter a valid Philippine mobile number "
                    "in the format +639XXXXXXXXX."
        ), 400

    operator, error = get_operator_account()

    if error:
        return error

    operator.mobile_number = mobile_number

    db.session.commit()

    return jsonify(
        message="Operator mobile number saved successfully.",
        username=operator.username,
        mobile_number=operator.mobile_number,
    ), 200
