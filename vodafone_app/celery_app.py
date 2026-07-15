"""Celery application with Redis broker and eager fallback for tests/dev."""

from __future__ import annotations

import os

from celery import Celery
from celery.schedules import crontab


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def make_celery(app_name: str = "vodafone_app") -> Celery:
    broker = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
    backend = os.getenv("CELERY_RESULT_BACKEND", broker)
    eager = _truthy(os.getenv("CELERY_TASK_ALWAYS_EAGER")) or _truthy(
        os.getenv("CELERY_EAGER")
    )

    celery = Celery(
        app_name,
        broker=broker,
        backend=backend,
        include=["services.tasks"],
    )
    celery.conf.update(
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        timezone="Africa/Cairo",
        enable_utc=True,
        task_track_started=True,
        task_always_eager=eager,
        task_eager_propagates=True,
        beat_schedule={
            "renewal-reminders-daily": {
                "task": "services.tasks.send_renewal_reminders",
                "schedule": crontab(hour=10, minute=0),
            },
            "reset-cash-wallet-counters": {
                "task": "services.tasks.reset_cash_wallet_counters",
                "schedule": crontab(minute=5, hour=0),
            },
        },
    )
    celery.autodiscover_tasks(["services"])
    return celery


celery_app = make_celery()
flask_app = None


def init_celery(app) -> Celery:
    """Bind the live Flask app so workers/eager tasks share the same context."""
    global flask_app
    flask_app = app
    # Ensure task modules are imported and registered on the shared app
    import services.tasks  # noqa: F401

    return celery_app
