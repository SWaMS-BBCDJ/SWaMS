import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-change-me")

    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        "mysql+mysqlconnector://root:@localhost:3307/swams_db"
    )

    SQLALCHEMY_TRACK_MODIFICATIONS = False

    DEVICE_API_KEY = os.getenv("DEVICE_API_KEY", "change-me")