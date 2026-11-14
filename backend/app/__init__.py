
from flask import Flask
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from zoneinfo import ZoneInfo

db = SQLAlchemy()

_scheduler = None


def create_app(config_class="config.Config"):
    global _scheduler

    app = Flask(__name__)
    app.config.from_object(config_class)
    CORS(app, origins=["http://localhost:5173"])
    db.init_app(app)

    from app.routes import main
    app.register_blueprint(main)

    with app.app_context():
        db.create_all()

    # Start the hourly logging scheduler only once.
    if _scheduler is None or not _scheduler.running:
        from app.services.hourly_logs import finalize_completed_hours

        def finalize_with_app_context():
            with app.app_context():
                finalize_completed_hours()

        _scheduler = BackgroundScheduler(
            timezone=ZoneInfo("Asia/Manila")
        )

        # Recover any unfinished hours after a backend restart.
        finalize_with_app_context()

        # Finalize completed hours at every Philippine-time hour boundary.
        _scheduler.add_job(
            finalize_with_app_context,
            trigger=CronTrigger(
                minute=0,
                timezone=ZoneInfo("Asia/Manila"),
            ),
            id="hourly_reading_finalizer",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
        )

        _scheduler.start()

    return app
