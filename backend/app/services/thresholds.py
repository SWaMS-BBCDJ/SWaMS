import math

"""Threshold evaluation - business logic behind alerts and suitability."""
from datetime import datetime, timezone

from app.models import (
    AlertIncident,
    IncidentParameter,
    Threshold,
)

PARAMETERS = ("ph", "temperature", "turbidity")

UNITS = {"ph": "", "temperature": "\u00b0C", "turbidity": "NTU"}


def get_limits():
    """Return safe and warning limits from the database."""
    return {
        t.parameter: {
            "safe_min": t.safe_min,
            "safe_max": t.safe_max,
            "warning_min": t.warning_min,
            "warning_max": t.warning_max,
        }
        for t in Threshold.query.all()
    }


def evaluate(values, limits=None):
    """
    Classify readings as safe, warning, or critical.
    Warning means outside the safe range but within warning boundaries.
    Critical means beyond the warning boundaries.
    """
    limits = limits if limits is not None else get_limits()
    breaches = []

    for param in PARAMETERS:
        if param not in values or values[param] is None:
            continue

        config = limits.get(param)
        if not config:
            continue

        # Support the old (safe_min, safe_max) tuple format too.
        if isinstance(config, dict):
            lo = config.get("safe_min")
            hi = config.get("safe_max")
            warning_min = config.get("warning_min")
            warning_max = config.get("warning_max")
        else:
            lo, hi = config
            warning_min = warning_max = None

        if lo is None or hi is None:
            continue

        value = float(values[param])

        if value < lo:
            severity = (
                "warning"
                if warning_min is not None and value >= warning_min
                else "critical"
            )
            direction = "low"

        elif value > hi:
            severity = (
                "warning"
                if warning_max is not None and value <= warning_max
                else "critical"
            )
            direction = "high"

        else:
            continue

        breaches.append({
            "parameter": param,
            "value": value,
            "safe_min": lo,
            "safe_max": hi,
            "warning_min": warning_min,
            "warning_max": warning_max,
            "direction": direction,
            "severity": severity,
        })

    return breaches

def all_sensors_safe(values, limits=None):
    """
    Return True only when all three sensor readings are valid
    and within their configured safe ranges.
    """

    limits = limits if limits is not None else get_limits()

    for param in PARAMETERS:
        if param not in values or values[param] is None:
            return False

        config = limits.get(param)

        if not config or not isinstance(config, dict):
            return False

        safe_min = config.get("safe_min")
        safe_max = config.get("safe_max")

        if safe_min is None or safe_max is None:
            return False

        try:
            value = float(values[param])
        except (TypeError, ValueError):
            return False

        if not math.isfinite(value):
            return False

        if value < safe_min or value > safe_max:
            return False

    return True


def format_message(breach):
    """Format a warning or critical alert message."""
    param = breach["parameter"]
    unit = (" " + UNITS[param]) if UNITS[param] else ""
    severity = breach.get("severity", "critical").upper()

    return (
        f"{severity}: {param} reading {breach['value']}{unit} is "
        f"{breach['direction']} - safe range is "
        f"{breach['safe_min']}-{breach['safe_max']}{unit}"
    )



def log_alerts(reading, breaches, db, values):
    """
    Maintain one active incident per pond.

    Multiple abnormal parameters belong to the same incident.
    The incident recovers only when all three parameters are safe.
    """

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Find an existing active incident for this pond.
    incident = AlertIncident.query.filter_by(
        pond_id=reading.pond_id,
        status="ACTIVE",
    ).order_by(
        AlertIncident.detected_at.desc(),
        AlertIncident.id.desc(),
    ).first()

    # No abnormal parameters: recover the active incident.
    # Recover only when all three sensors are confirmed safe.
    if all_sensors_safe(values) and not breaches:
        if incident is not None:
            incident.status = "RECOVERED"
            incident.last_updated_at = now
            incident.recovered_at = now

            for parameter_record in incident.parameters:
                if parameter_record.recovered_at is None:
                    parameter_record.recovered_at = now

        return

    # Missing or invalid readings must never recover an incident.
    if not breaches:
        return

    # Create an incident if no active incident exists.
    if incident is None:
        incident = AlertIncident(
            pond_id=reading.pond_id,
            detected_at=now,
            last_updated_at=now,
            status="ACTIVE",
        )
        db.session.add(incident)
        db.session.flush()

    else:
        incident.last_updated_at = now

    active_parameters = {
        breach["parameter"]: breach
        for breach in breaches
    }

    # Update or create records for abnormal parameters.
    for parameter, breach in active_parameters.items():

        parameter_record = IncidentParameter.query.filter_by(
            incident_id=incident.id,
            parameter=parameter,
        ).first()

        if parameter_record is None:
            parameter_record = IncidentParameter(
                incident_id=incident.id,
                parameter=parameter,
                first_detected_at=now,
                last_updated_at=now,
                latest_value=breach["value"],
                severity=breach["severity"].upper(),
                direction=breach["direction"].upper(),
            )
            db.session.add(parameter_record)

        else:
            parameter_record.last_updated_at = now
            parameter_record.latest_value = breach["value"]
            parameter_record.severity = breach["severity"].upper()
            parameter_record.direction = breach["direction"].upper()

            # The parameter became abnormal again before full recovery.
            parameter_record.recovered_at = None

    # Mark parameters that are now safe.
    for parameter_record in incident.parameters:
        if parameter_record.parameter not in active_parameters:
            if parameter_record.recovered_at is None:
                parameter_record.recovered_at = now
