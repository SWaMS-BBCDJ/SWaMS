
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from app import db
from app.models import HourlyReadingBuffer, Reading
from app.services.thresholds import evaluate


PH_TIMEZONE = ZoneInfo("Asia/Manila")


def finalize_completed_hours():
    """
    Save buffered readings for Philippine-time hours that have ended.
    The historical timestamp represents the end of the hour.
    """

    now_ph = datetime.now(PH_TIMEZONE)

    current_hour_start_ph = now_ph.replace(
        minute=0,
        second=0,
        microsecond=0,
    )

    current_hour_start_utc = (
        current_hour_start_ph
        .astimezone(timezone.utc)
        .replace(tzinfo=None)
    )

    buffers = HourlyReadingBuffer.query.filter(
        HourlyReadingBuffer.hour_start < current_hour_start_utc
    ).all()

    try:
        for buffer in buffers:
            hour_end_utc = buffer.hour_start + timedelta(hours=1)

            existing = Reading.query.filter_by(
                pond_id=buffer.pond_id,
                timestamp=hour_end_utc,
            ).first()

            if existing is None:
                values = {
                    "ph": buffer.ph,
                    "temperature": buffer.temperature,
                    "turbidity": buffer.turbidity,
                }

                breaches = evaluate(values)

                reading = Reading(
                    pond_id=buffer.pond_id,
                    timestamp=hour_end_utc,
                    ph=buffer.ph,
                    temperature=buffer.temperature,
                    turbidity=buffer.turbidity,
                    is_anomalous=bool(breaches),
                )

                db.session.add(reading)

            # Remove the buffer after its hour has been finalized.
            db.session.delete(buffer)

        db.session.commit()

    except Exception:
        db.session.rollback()
        raise
