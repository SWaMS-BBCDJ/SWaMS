from app import create_app, db
from app.models import Pond, Threshold

app = create_app()

DEFAULTS = [
    ("ph", 6.5, 9.0),
    ("temperature", 27.0, 30.0),
    ("turbidity", 0.0, 50.0),
]

with app.app_context():
    db.create_all()

    for param, lo, hi in DEFAULTS:
        if not Threshold.query.filter_by(parameter=param).first():
            db.session.add(Threshold(parameter=param, safe_min=lo, safe_max=hi))

    if not Pond.query.first():
        db.session.add(Pond(name="Demo Pond", location="Claveria, Misamis Oriental"))

    db.session.commit()
    print("Seeded thresholds and demo pond.")
