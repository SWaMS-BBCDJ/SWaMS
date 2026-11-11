
"""Threshold evaluation - business logic behind alerts and suitability."""

from app.models import AlertLog, Threshold

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


def log_alerts(reading, breaches, db):
    """Persist one AlertLog row per breach."""
    for breach in breaches:
        db.session.add(AlertLog(
            reading_id=reading.id,
            parameter=breach["parameter"],
            value=breach["value"],
            message=format_message(breach),
            sent_at=reading.timestamp,
        ))
