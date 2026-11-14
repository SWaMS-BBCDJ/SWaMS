
from datetime import datetime, timedelta, timezone

from app import db
from app.models import (
    AlertIncident,
    IncidentParameter,
    SMSCommand,
    User,
)


REMINDER_INTERVAL_MINUTES = 10
ACK_COOLDOWN_MINUTES = 60


def check_sms_reminders():
    """
    Queue reminder SMS messages for active critical incidents.

    Rules:
    - Remind every 10 minutes after the last successfully sent SMS.
    - Pause reminders for 60 minutes after ACK.
    - Resume reminders after cooldown if critical conditions remain.
    - Never remind for recovered incidents.
    """

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    incidents = AlertIncident.query.filter_by(
        status="ACTIVE"
    ).all()

    operator = User.query.filter_by(role="operator").first()

    if not operator or not operator.mobile_number:
        return

    for incident in incidents:

        # Only consider unresolved critical parameters.
        critical_parameters = IncidentParameter.query.filter_by(
            incident_id=incident.id,
            severity="CRITICAL",
            recovered_at=None,
        ).all()

        if not critical_parameters:
            continue

        # Pause reminders for one hour after acknowledgment.
        if incident.acknowledged_at is not None:
            cooldown_ends = (
                incident.acknowledged_at
                + timedelta(minutes=ACK_COOLDOWN_MINUTES)
            )

            if now < cooldown_ends:
                continue

        # Do not queue another reminder while an SMS is pending
        # or currently being sent.
        unfinished_command = SMSCommand.query.filter(
            SMSCommand.incident_id == incident.id,
            SMSCommand.status.in_(["PENDING", "SENDING"]),
        ).first()

        if unfinished_command:
            continue

        # Find the most recent successfully sent SMS for this incident.
        last_sent_command = SMSCommand.query.filter(
            SMSCommand.incident_id == incident.id,
            SMSCommand.status == "SENT",
            SMSCommand.sent_at.isnot(None),
        ).order_by(
            SMSCommand.sent_at.desc(),
            SMSCommand.id.desc(),
        ).first()

        if last_sent_command is None:
            continue

        # Wait 10 minutes after the last successful SMS.
        reminder_due_at = (
            last_sent_command.sent_at
            + timedelta(minutes=REMINDER_INTERVAL_MINUTES)
        )

        # After ACK cooldown, start a fresh 10-minute interval.
        if incident.acknowledged_at is not None:
            cooldown_ends = (
                incident.acknowledged_at
                + timedelta(minutes=ACK_COOLDOWN_MINUTES)
            )

            reminder_due_at = max(
                reminder_due_at,
                cooldown_ends,
            )

        if now < reminder_due_at:
            continue

        message = (
            f"SWaMS CRITICAL REMINDER: Incident INC-{incident.id:03d} "
            "is still active. Check the SWaMS dashboard."
        )

        reminder = SMSCommand(
            incident_id=incident.id,
            phone_number=operator.mobile_number,
            message=message,
            status="PENDING",
        )

        db.session.add(reminder)

    db.session.commit()
