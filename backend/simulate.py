"""Seed four weeks of plausible tilapia pond readings for demos and defense."""
import random
from datetime import datetime, timedelta

from app import create_app, db
from app.models import AlertLog, Pond, Reading, Threshold

random.seed(42)  # deterministic — same data every run

app = create_app()

START = datetime.utcnow() - timedelta(weeks=4)
COUNT = 168  # one reading every 4 hours for 4 weeks

with app.app_context():
    pond = Pond.query.first()
    if pond is None:
        pond = Pond(name="Demo Pond", location="Claveria, Misamis Oriental")
        db.session.add(pond)
        db.session.commit()

    limits = {t.parameter: (t.safe_min, t.safe_max) for t in Threshold.query.all()}

    for i in range(COUNT):
        ts = START + timedelta(hours=4 * i)
        hour = ts.hour
        ph = round(random.gauss(7.6, 0.25), 2)
        temp = round(28.4 + 1.6 * __import__("math").sin((hour / 24) * 2 * 3.14159) + random.gauss(0, 0.3), 2)
        turb = round(max(1.0, random.gauss(22, 6)), 2)

        # inject occasional breaches so the alert log and charts have content
        if random.random() < 0.03:
            turb = round(random.uniform(60, 95), 2)
        if random.random() < 0.02:
            ph = round(random.uniform(9.2, 10.0), 2)

        breaches = [
            p for p, v in (("ph", ph), ("temperature", temp), ("turbidity", turb))
            if p in limits and not (limits[p][0] <= v <= limits[p][1])
        ]

        r = Reading(
            pond_id=pond.id, timestamp=ts,
            ph=ph, temperature=temp, turbidity=turb,
            is_anomalous=bool(breaches),
        )
        db.session.add(r)
        db.session.flush()  # assigns r.id without committing yet

        for p in breaches:
            val = {"ph": ph, "temperature": temp, "turbidity": turb}[p]
            db.session.add(AlertLog(
                reading_id=r.id, parameter=p, value=val,
                message=f"{p} out of safe range: {val}",
                sent_at=ts,
            ))

    db.session.commit()
    print(f"Inserted {COUNT} readings and {AlertLog.query.count()} alert entries.")
