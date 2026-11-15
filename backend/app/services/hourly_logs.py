from sqlalchemy.exc import IntegrityError
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from app import db
from app.models import (
    HourlyReadingBuffer,
    Reading,
    SMSCommand,
    User,
)
from app.services.thresholds import evaluate


PH_TIMEZONE = ZoneInfo("Asia/Manila")


def get_hourly_status(breaches):
    """
    Determine the overall hourly water quality status.
    CRITICAL takes priority over WARNING.
    """

    if any(
        breach["severity"].lower() == "critical"
        for breach in breaches
    ):
        return "CRITICAL"

    if any(
        breach["severity"].lower() == "warning"
        for breach in breaches
    ):
        return "WARNING"

    return "SAFE"



def create_hourly_sms(buffer, hour_end_utc, breaches):
    """
    Queue one hourly SMS report for the finalized reading.
    Hourly reports are independent of critical incidents.
    """

    operator = User.query.filter_by(
        role="operator"
    ).first()

    if not operator or not operator.mobile_number:
        print("HOURLY SMS SKIPPED: OPERATOR NUMBER NOT FOUND")
        return

    hour_end_ph = (
        hour_end_utc
        .replace(tzinfo=timezone.utc)
        .astimezone(PH_TIMEZONE)
    )

    status = get_hourly_status(breaches)

    timestamp_label = hour_end_ph.strftime(
        "%Y-%m-%d %I:%M %p"
    )

    message = (
        "SWaMS HOURLY WATER QUALITY REPORT\n"
        f"Hour Ending: {timestamp_label}\n"
        f"pH: {buffer.ph:.2f}\n"
        f"Temperature: {buffer.temperature:.2f} C\n"
        f"Turbidity: {buffer.turbidity:.2f} NTU\n"
        f"Water Quality Status: {status}"
    )

    existing_command = SMSCommand.query.filter_by(
        incident_id=None,
        phone_number=operator.mobile_number,
        message=message,
    ).first()

    if existing_command:
        print(
            f"HOURLY SMS ALREADY QUEUED: {timestamp_label}"
        )
        return

    command = SMSCommand(
        incident_id=None,
        phone_number=operator.mobile_number,
        message=message,
        status="PENDING",
    )

    db.session.add(command)

    try:
        db.session.flush()
        print(
            f"HOURLY SMS QUEUED: {timestamp_label} - {status}"
        )

    except IntegrityError:
        raise




def finalize_completed_hours():
    """
    Save buffered readings for Philippine-time hours that have ended.
    The historical timestamp represents the end of the hour.

    Also queue one SMS report using the same hourly sensor values.
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

    buffer_ids = [
        row.id
        for row in HourlyReadingBuffer.query.filter(
            HourlyReadingBuffer.hour_start < current_hour_start_utc
        ).all()
    ]

    for buffer_id in buffer_ids:
        try:
            buffer = db.session.get(
                HourlyReadingBuffer,
                buffer_id,
            )

            if buffer is None:
                continue

            hour_end_utc = buffer.hour_start + timedelta(hours=1)

            values = {
                "ph": buffer.ph,
                "temperature": buffer.temperature,
                "turbidity": buffer.turbidity,
            }

            breaches = evaluate(values)

            existing = Reading.query.filter_by(
                pond_id=buffer.pond_id,
                timestamp=hour_end_utc,
            ).first()

            if existing is None:
                reading = Reading(
                    pond_id=buffer.pond_id,
                    timestamp=hour_end_utc,
                    ph=buffer.ph,
                    temperature=buffer.temperature,
                    turbidity=buffer.turbidity,
                    is_anomalous=bool(breaches),
                )

                db.session.add(reading)

            # Flush the reading before queuing the SMS.
            db.session.flush()

            create_hourly_sms(
                buffer,
                hour_end_utc,
                breaches,
            )

            # Commit the reading, SMS command, and buffer deletion together.
            db.session.delete(buffer)
            db.session.commit()

            print(
                f"HOURLY LOG FINALIZED: {hour_end_utc}"
            )

        except IntegrityError:
            db.session.rollback()

            print(
                f"DUPLICATE DATABASE RECORD DETECTED "
                f"FOR BUFFER ID: {buffer_id}"
            )

            # Leave the buffer in place for a later retry.

        except Exception:
            db.session.rollback()
            raise

    print("HOURLY LOG FINALIZATION COMPLETE")

