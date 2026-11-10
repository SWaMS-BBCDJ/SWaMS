"""Threshold evaluation — the business logic behind alerts and suitability."""
from app.models import AlertLog, Threshold

PARAMETERS = ("ph", "temperature", "turbidity")

UNITS = {"ph": "", "temperature": "\u00b0C", "turbidity": "NTU"}


def get_limits():
    """Return {parameter: (safe_min, safe_max)} from the database."""
    return {t.parameter: (t.safe_min, t.safe_max) for t in Threshold.query.all()}


def evaluate(values, limits=None):
    """
    values: {"ph": 7.4, "temperature": 28.1, "turbidity": 22.0}
    Returns a list of breach dicts, empty when everything is in range.
    """
    limits = limits if limits is not None else get_limits()
    breaches = []

    for param in PARAMETERS:
        if param not in values or values[param] is None:
            continue
        lo, hi = limits.get(param, (None, None))
        if lo is None:
            continue
        value = values[param]
        if value < lo or value > hi:
            breaches.append({
                "parameter": param,
                "value": value,
                "safe_min": lo,
                "safe_max": hi,
                "direction": "low" if value < lo else "high",
            })

    return breaches


def format_message(breach):
    """The SMS-shaped text, reused for the alert log."""
    param = breach["parameter"]
    unit = (" " + UNITS[param]) if UNITS[param] else ""
    return (
        f"ALERT: {param} reading {breach['value']}{unit} is "
        f"{breach['direction']} — safe range is "
        f"{breach['safe_min']}-{breach['safe_max']}{unit}"
    )


def log_alerts(reading, breaches, db):
    """Persist one AlertLog row per breach, tied to the reading."""
    for b in breaches:
        db.session.add(AlertLog(
            reading_id=reading.id,
            parameter=b["parameter"],
            value=b["value"],
            message=format_message(b),
            sent_at=reading.timestamp,
        ))
