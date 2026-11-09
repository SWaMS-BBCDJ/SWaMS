
import os
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-change-me")

    SQLALCHEMY_DATABASE_URI = (
        "sqlite:///" + os.path.join(
            BASE_DIR, "instance", "swams.db"
        )
    )

    SQLALCHEMY_TRACK_MODIFICATIONS = False

    DEVICE_API_KEY = os.getenv("DEVICE_API_KEY", "change-me")
