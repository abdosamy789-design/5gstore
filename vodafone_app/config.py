import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL", f"sqlite:///{BASE_DIR / 'vodafone_store.db'}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
    ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
    PAYMENT_WEBHOOK_TOKEN = os.getenv(
        "PAYMENT_WEBHOOK_TOKEN", "mobile-app-secret-token"
    )
    VODAFONE_CASH_NUMBER = os.getenv("VODAFONE_CASH_NUMBER", "01000000000")
