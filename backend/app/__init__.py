
from flask import Flask
import os
from dotenv import load_dotenv
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from zoneinfo import ZoneInfo

load_dotenv()

db = SQLAlchemy()
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
_scheduler = None

def create_app(config_class="config.Config"):
    global _scheduler

    app = Flask(__name__)
    app.config.from_object(config_class)
    CORS(
        app,
        resources={
            r"/api/*": {
                "origins": [
                    "https://s-wa-ms.vercel.app",
                    "https://swams-frontend.vercel.app"
                ]
            }
        },
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization"]
    )
    
    db.init_app(app)



    from app.routes import main
    app.register_blueprint(main)

    with app.app_context():
        db.create_all()

    # Start the hourly logging scheduler only once.
    if _scheduler is None or not _scheduler.running:
        from app.services.hourly_logs import finalize_completed_hours
        from app.services.sms_reminders import check_sms_reminders
        
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

        def check_reminders_with_app_context():
            with app.app_context():
                check_sms_reminders()


        _scheduler.add_job(
            check_reminders_with_app_context,
            trigger="interval",
            minutes=1,
            id="sms_reminder_checker",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
        )

        _scheduler.start()
        

    return app
