"""Background tasks: verification, activation refunds, renewal reminders."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from celery_app import celery_app

logger = logging.getLogger(__name__)


def _app_context():
    import celery_app as ca

    if ca.flask_app is not None:
        return ca.flask_app.app_context()

    # Celery worker cold start
    from app import create_app

    application = create_app()
    ca.flask_app = application
    return application.app_context()


@celery_app.task(name="services.tasks.verify_order_account", bind=True)
def verify_order_account(
    self, order_id: int, otp_token: str | None = None, mode_override: str | None = None
) -> dict:
    """Run Vodafone account verification off the request thread."""
    with _app_context():
        from models import Order, db
        from services.notifications import notify_order_update
        from services.wallet_rotation import assign_receiving_wallet
        from services.vodafone_validator import verify_vodafone_account

        order = Order.query.get(order_id)
        if not order:
            return {"ok": False, "error": "order_not_found"}

        order.status = "verifying"
        order.verification_task_id = self.request.id or ""
        db.session.commit()

        result = verify_vodafone_account(
            order.vodafone_number,
            password=order.account_password,
            national_id=order.national_id,
            otp_token=otp_token,
            mode_override=mode_override,
        )

        order.verification_mode = result.get("mode") or ""
        order.verification_message = result.get("message") or ""
        order.account_verified = bool(result.get("ok"))

        if result.get("ok"):
            if result.get("normalized"):
                order.vodafone_number = result["normalized"]
            wallet = assign_receiving_wallet(order.amount)
            if wallet:
                order.cash_wallet_id = wallet.id
                order.pay_to_number = wallet.number
            order.status = "awaiting_payment"
        else:
            order.status = "verification_failed"

        db.session.commit()
        notify_order_update(
            order, event="verified" if order.account_verified else "verification_failed"
        )
        return {
            "ok": order.account_verified,
            "order_id": order.id,
            "reference": order.reference,
            "status": order.status,
            "message": order.verification_message,
        }


@celery_app.task(name="services.tasks.mark_activation_failed")
def mark_activation_failed(order_id: int, reason: str = "") -> dict:
    """Mark activation failed and credit customer internal wallet."""
    with _app_context():
        from models import Order, db
        from services.customer_wallet import credit_wallet_for_phone
        from services.notifications import notify_order_update

        order = Order.query.get(order_id)
        if not order:
            return {"ok": False, "error": "order_not_found"}

        if order.status in {"fulfilled", "refunded_wallet"}:
            return {"ok": False, "error": "invalid_status", "status": order.status}

        order.status = "activation_failed"
        if reason:
            order.notes = ((order.notes or "") + f"\nفشل التفعيل: {reason}").strip()
        db.session.commit()

        wallet = credit_wallet_for_phone(
            phone=order.whatsapp_number or order.vodafone_number,
            amount=order.amount,
            name=order.customer_name,
            reason="refund_activation_failed",
            order_id=order.id,
        )
        order.customer_wallet_id = wallet.id
        order.status = "refunded_wallet"
        db.session.commit()

        notify_order_update(order, event="refunded_wallet")
        return {
            "ok": True,
            "order_id": order.id,
            "wallet_id": wallet.id,
            "balance": wallet.balance,
        }


@celery_app.task(name="services.tasks.send_renewal_reminders")
def send_renewal_reminders() -> dict:
    """WhatsApp customers ~3 days before monthly package renewal."""
    with _app_context():
        from models import Order, db
        from services.notifications import notify_customer_whatsapp

        now = datetime.now(timezone.utc)
        target = (now + timedelta(days=3)).date()

        orders = (
            Order.query.filter(
                Order.status == "fulfilled",
                Order.reminder_sent.is_(False),
                Order.renewal_at.isnot(None),
            ).all()
        )
        due = [
            o
            for o in orders
            if o.renewal_at
            and (
                o.renewal_at.replace(tzinfo=timezone.utc)
                if o.renewal_at.tzinfo is None
                else o.renewal_at
            ).date()
            == target
        ]

        sent = 0
        for order in due:
            phone = order.whatsapp_number or order.vodafone_number
            pkg = order.package.name if order.package else "باقتك"
            renew_date = order.renewal_at.strftime("%Y-%m-%d") if order.renewal_at else ""
            msg = (
                f"تذكير تجديد فودافون ريد\n"
                f"طلبك {order.reference}\n"
                f"الباقة: {pkg}\n"
                f"موعد التجديد المتوقع: {renew_date}\n"
                f"متبقي حوالي 3 أيام — جدّد من الموقع عشان متفصلش."
            )
            notify_customer_whatsapp(phone, msg)
            order.reminder_sent = True
            sent += 1

        db.session.commit()
        return {"ok": True, "candidates": len(due), "sent": sent}


@celery_app.task(name="services.tasks.reset_cash_wallet_counters")
def reset_cash_wallet_counters() -> dict:
    with _app_context():
        from services.wallet_rotation import refresh_all_wallet_periods

        return refresh_all_wallet_periods()


def enqueue_verification(
    order_id: int, otp_token: str | None = None, mode_override: str | None = None
):
    """Helper used by web routes — eager-safe."""
    return verify_order_account.delay(order_id, otp_token, mode_override)
