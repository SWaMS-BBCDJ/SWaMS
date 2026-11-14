
from itsdangerous import URLSafeTimedSerializer, BadSignature
from app.models import User
from functools import wraps
import re
import math

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from flask import (
    Blueprint,
    current_app,
    jsonify,
    render_template,
    request,
)
from sqlalchemy import func

from app import db
from app.models import (
    AlertIncident,
    AlertLog,
    HourlyReadingBuffer,
    IncidentParameter,
    LiveReading,
    Pond,
    Reading,
    SMSCommand,
    Threshold,
)
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

    query = AlertIncident.query

    if start_date:
        start_datetime = datetime.combine(start_date, time.min)
        query = query.filter(
            AlertIncident.detected_at >= start_datetime
        )

    if end_date:
        end_datetime = datetime.combine(
            end_date + timedelta(days=1),
            time.min,
        )
        query = query.filter(
            AlertIncident.detected_at < end_datetime
        )

    if parameter and parameter.lower() in {
        "ph", "temperature", "turbidity"
    }:
        query = query.filter(
            AlertIncident.parameters.any(
                func.lower(IncidentParameter.parameter) == parameter.lower()
            )
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


def serialize_alert(incident):

    return {
        "id": incident.id,
        "pond_id": incident.pond_id,
        "detected_at": (
            incident.detected_at.isoformat()
            if incident.detected_at else None
        ),
        "last_updated_at": (
            incident.last_updated_at.isoformat()
            if incident.last_updated_at else None
        ),
        "acknowledged_at": (
            incident.acknowledged_at.isoformat()
            if incident.acknowledged_at else None
        ),
        "recovered_at": (
            incident.recovered_at.isoformat()
            if incident.recovered_at else None
        ),
        "status": incident.status,
        "parameters": [
            {
                "parameter": p.parameter,
                "first_detected_at": (
                    p.first_detected_at.isoformat()
                    if p.first_detected_at else None
                ),
                "last_updated_at": (
                    p.last_updated_at.isoformat()
                    if p.last_updated_at else None
                ),
                "latest_value": p.latest_value,
                "severity": p.severity,
                "direction": p.direction,
                "recovered_at": (
                    p.recovered_at.isoformat()
                    if p.recovered_at else None
                ),
            }
            for p in incident.parameters
        ],
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
            "t": reading.timestamp.isoformat() + "Z",
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
    AlertIncident.detected_at.desc(),
    AlertIncident.id.desc(),
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

    
    
    # Current measurement timestamp (UTC, stored as naive datetime)
    measurement_time = datetime.now(timezone.utc).replace(tzinfo=None)

    # Convert measurement time to Philippine time
    measurement_time_ph = measurement_time.replace(
        tzinfo=timezone.utc
    ).astimezone(ZoneInfo("Asia/Manila"))

    # Get the beginning of the current Philippine-time hour
    hour_start_ph = measurement_time_ph.replace(
        minute=0,
        second=0,
        microsecond=0,
    )

    # Store the hour start in UTC
    hour_start_utc = (
        hour_start_ph
        .astimezone(timezone.utc)
        .replace(tzinfo=None)
    )

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
    # 2. UPDATE CURRENT HOURLY BUFFER
    # ==========================================

    buffer = HourlyReadingBuffer.query.filter_by(
        pond_id=pond.id,
        hour_start=hour_start_utc,
    ).first()

    if buffer is None:
        buffer = HourlyReadingBuffer(
            pond_id=pond.id,
            hour_start=hour_start_utc,
            ph=ph,
            temperature=temperature,
            turbidity=turbidity,
        )
        db.session.add(buffer)
    else:
        # Keep the latest valid reading received this hour
        buffer.ph = ph
        buffer.temperature = temperature
        buffer.turbidity = turbidity

    # ==========================================
    # 3. EVALUATE CURRENT SENSOR VALUES
    # ==========================================

    breaches = evaluate({
        "ph": ph,
        "temperature": temperature,
        "turbidity": turbidity,
    })

    # Keep the existing alert logging behavior for now.
    # This temporary Reading object is NOT saved as history.
    alert_reading = Reading(
        pond_id=pond.id,
        timestamp=measurement_time,
        ph=ph,
        temperature=temperature,
        turbidity=turbidity,
        is_anomalous=bool(breaches),
    )

    log_alerts(
    alert_reading,
    breaches,
    db,
    {
        "ph": ph,
        "temperature": temperature,
        "turbidity": turbidity,
    },
)

    # ==========================================
    # 4. SAVE DATABASE CHANGES
    # ==========================================

    db.session.commit()

    return jsonify(
        id=live_reading.id,
        is_anomalous=bool(breaches),
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
            "safe_max": item.safe_max,
            "warning_min": item.warning_min,
            "warning_max": item.warning_max
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

    updates = []

    for parameter in allowed_parameters:

        if parameter not in data:
            continue

        values = data[parameter]

        if not isinstance(values, dict):
            return jsonify(message=f"Invalid settings for {parameter}"), 400

        threshold = Threshold.query.filter_by(
            parameter=parameter
        ).first()

        try:
            safe_min = float(values["safe_min"])
            safe_max = float(values["safe_max"])

            warning_min = (
                float(values["warning_min"])
                if "warning_min" in values and values["warning_min"] is not None
                else (
                    None if "warning_min" in values
                    else threshold.warning_min if threshold else None
                )
            )

            warning_max = (
                float(values["warning_max"])
                if "warning_max" in values and values["warning_max"] is not None
                else (
                    None if "warning_max" in values
                    else threshold.warning_max if threshold else None
                )
            )

        except (KeyError, TypeError, ValueError):
            return jsonify(message=f"Invalid range for {parameter}"), 400

        numbers = [safe_min, safe_max]
        numbers.extend(
            value for value in (warning_min, warning_max)
            if value is not None
        )

        if not all(math.isfinite(value) for value in numbers):
            return jsonify(message="Values must be finite numbers"), 400

        if safe_min >= safe_max:
            return jsonify(
                message=f"Minimum must be lower than maximum for {parameter}"
            ), 400

        if warning_min is not None and warning_min >= safe_min:
            return jsonify(
                message=f"Warning minimum must be lower than safe minimum for {parameter}"
            ), 400

        if warning_max is not None and warning_max <= safe_max:
            return jsonify(
                message=f"Warning maximum must be higher than safe maximum for {parameter}"
            ), 400

        if parameter == "ph":
            if safe_min < 0 or safe_max > 14:
                return jsonify(message="pH must be between 0 and 14"), 400
            if warning_min is not None and warning_min < 0:
                return jsonify(message="pH warning minimum cannot be below 0"), 400
            if warning_max is not None and warning_max > 14:
                return jsonify(message="pH warning maximum cannot exceed 14"), 400

        if parameter == "temperature":
            if safe_min < -10 or safe_max > 60:
                return jsonify(message="Invalid temperature range"), 400
            if warning_min is not None and warning_min < -10:
                return jsonify(message="Invalid warning temperature minimum"), 400
            if warning_max is not None and warning_max > 60:
                return jsonify(message="Invalid warning temperature maximum"), 400

        if parameter == "turbidity":
            if safe_min < 0 or (warning_min is not None and warning_min < 0):
                return jsonify(message="Turbidity cannot be negative"), 400
            if warning_max is not None and warning_max < 0:
                return jsonify(message="Turbidity warning maximum cannot be negative"), 400

        updates.append((
            parameter, safe_min, safe_max, warning_min, warning_max
        ))

    for parameter, safe_min, safe_max, warning_min, warning_max in updates:

        threshold = Threshold.query.filter_by(
            parameter=parameter
        ).first()

        if threshold is None:
            threshold = Threshold(parameter=parameter)
            db.session.add(threshold)

        threshold.safe_min = safe_min
        threshold.safe_max = safe_max
        threshold.warning_min = warning_min
        threshold.warning_max = warning_max

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


# ==========================================
# ESP32 SMS COMMAND QUEUE
# ==========================================

@main.post("/api/device/sms-commands/next")
def get_next_sms_command():

    key = request.headers.get("X-Device-Key")

    if key != current_app.config["DEVICE_API_KEY"]:
        return jsonify(error="unauthorized"), 401

    command = SMSCommand.query.filter_by(
        status="PENDING"
    ).order_by(
        SMSCommand.created_at.asc(),
        SMSCommand.id.asc(),
    ).first()

    if command is None:
        return jsonify(command=None), 200

    command.status = "SENDING"
    db.session.commit()

    return jsonify(
        command={
            "id": command.id,
            "phone_number": command.phone_number,
            "message": command.message,
        }
    ), 200


@main.post("/api/device/sms-commands/<int:command_id>/result")
def update_sms_command_result(command_id):

    key = request.headers.get("X-Device-Key")

    if key != current_app.config["DEVICE_API_KEY"]:
        return jsonify(error="unauthorized"), 401

    command = db.session.get(SMSCommand, command_id)

    if command is None:
        return jsonify(error="command not found"), 404

    if command.status != "SENDING":
        return jsonify(error="command is not awaiting a result"), 409

    data = request.get_json(silent=True) or {}
    result = str(data.get("status", "")).strip().upper()

    if result not in ("SENT", "FAILED"):
        return jsonify(error="status must be SENT or FAILED"), 400

    command.status = result

    if result == "SENT":
        command.sent_at = datetime.utcnow()

    db.session.commit()

    return jsonify(
        message="SMS command result saved",
        command_id=command.id,
        status=command.status,
    ), 200