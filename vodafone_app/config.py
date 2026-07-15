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
    ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "Admin@Red2026!")

    PAYMENT_WEBHOOK_TOKEN = os.getenv(
        "PAYMENT_WEBHOOK_TOKEN", "mobile-app-secret-token"
    )
    VODAFONE_CASH_NUMBER = os.getenv("VODAFONE_CASH_NUMBER", "01000000000")
    INSTAPAY_ADDRESS = os.getenv("INSTAPAY_ADDRESS", "")

    VODAFONE_VERIFY_MODE = os.getenv("VODAFONE_VERIFY_MODE", "mock")
    VODAFONE_PORTAL_URL = os.getenv(
        "VODAFONE_PORTAL_URL", "https://web.vodafone.com.eg/ar/home"
    )

    TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")
    WHATSAPP_PROVIDER = os.getenv("WHATSAPP_PROVIDER", "callmebot")
    WHATSAPP_API_KEY = os.getenv("WHATSAPP_API_KEY", "")
    WHATSAPP_INSTANCE_ID = os.getenv("WHATSAPP_INSTANCE_ID", "")
    WHATSAPP_WEBHOOK_URL = os.getenv("WHATSAPP_WEBHOOK_URL", "")

    ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "")

    CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
    CELERY_RESULT_BACKEND = os.getenv(
        "CELERY_RESULT_BACKEND", os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
    )
    CELERY_TASK_ALWAYS_EAGER = os.getenv("CELERY_TASK_ALWAYS_EAGER", "0")
