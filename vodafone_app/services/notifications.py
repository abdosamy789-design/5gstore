"""Telegram (admin) and WhatsApp (customer) order notifications."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING
from urllib.parse import quote

import requests

if TYPE_CHECKING:
    from flask import Flask

logger = logging.getLogger(__name__)

STATUS_AR = {
    "verifying": "جاري التحقق من الحساب",
    "verification_failed": "فشل التحقق",
    "awaiting_payment": "في انتظار الدفع",
    "payment_submitted": "تم تسجيل التحويل — جاري المطابقة",
    "paid": "تم تأكيد الدفع",
    "fulfilled": "تم تفعيل الباقة",
    "activation_failed": "فشل التفعيل",
    "refunded_wallet": "تم رد المبلغ للمحفظة الداخلية",
    "rejected": "مرفوض",
}


def _setting(key: str, default: str = "") -> str:
    from models import Setting

    row = Setting.query.filter_by(key=key).first()
    return (row.value if row else default) or default


def notify_admin_telegram(title: str, body: str) -> bool:
    token = _setting("telegram_bot_token")
    chat_id = _setting("telegram_chat_id")
    if not token or not chat_id:
        logger.info("Telegram skipped (not configured): %s", title)
        return False

    text = f"*{title}*\n{body}"
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    try:
        resp = requests.post(
            url,
            json={
                "chat_id": chat_id,
                "text": text,
                "parse_mode": "Markdown",
                "disable_web_page_preview": True,
            },
            timeout=12,
        )
        ok = resp.ok and resp.json().get("ok", False)
        if not ok:
            logger.warning("Telegram failed: %s", resp.text[:300])
        return bool(ok)
    except requests.RequestException as exc:
        logger.warning("Telegram error: %s", exc)
        return False


def notify_customer_whatsapp(phone: str, message: str) -> bool:
    """
    Supports:
    - callmebot: WHATSAPP_PROVIDER=callmebot + api_key
    - ultramsg: WHATSAPP_PROVIDER=ultramsg + instance_id + token
    - webhook: WHATSAPP_PROVIDER=webhook + custom URL (POST JSON)
    """
    if not phone:
        return False

    provider = (_setting("whatsapp_provider") or "callmebot").lower()
    digits = "".join(c for c in phone if c.isdigit())
    if digits.startswith("0") and len(digits) == 11:
        digits = "20" + digits[1:]

    try:
        if provider == "callmebot":
            api_key = _setting("whatsapp_api_key")
            if not api_key:
                logger.info("WhatsApp CallMeBot skipped (no api key)")
                return False
            url = (
                "https://api.callmebot.com/whatsapp.php"
                f"?phone={digits}&text={quote(message)}&apikey={quote(api_key)}"
            )
            resp = requests.get(url, timeout=15)
            return resp.ok

        if provider == "ultramsg":
            instance = _setting("whatsapp_instance_id")
            token = _setting("whatsapp_api_key")
            if not instance or not token:
                return False
            url = f"https://api.ultramsg.com/{instance}/messages/chat"
            resp = requests.post(
                url,
                data={"token": token, "to": f"+{digits}", "body": message},
                timeout=15,
            )
            return resp.ok

        if provider == "webhook":
            hook = _setting("whatsapp_webhook_url")
            if not hook:
                return False
            resp = requests.post(
                hook,
                json={"phone": digits, "message": message},
                timeout=15,
            )
            return resp.ok

        logger.info("Unknown WhatsApp provider: %s", provider)
        return False
    except requests.RequestException as exc:
        logger.warning("WhatsApp error: %s", exc)
        return False


def order_status_message(order) -> str:
    status = STATUS_AR.get(order.status, order.status)
    pkg = order.package.name if order.package else "-"
    return (
        f"طلبك {order.reference}\n"
        f"الباقة: {pkg}\n"
        f"المبلغ: {order.amount:.0f} ج.م\n"
        f"الحالة: {status}"
    )


def notify_order_update(order, event: str = "update") -> None:
    """Notify admin (Telegram) and customer (WhatsApp) about an order event."""
    status = STATUS_AR.get(order.status, order.status)
    pkg = order.package.name if order.package else "-"
    admin_body = (
        f"الحدث: {event}\n"
        f"الطلب: `{order.reference}`\n"
        f"العميل: {order.customer_name}\n"
        f"الخط: `{order.vodafone_number}`\n"
        f"الباقة: {pkg}\n"
        f"المبلغ: {order.amount:.0f} ج.م\n"
        f"الحالة: {status}"
    )
    notify_admin_telegram("تحديث طلب فودافون ريد", admin_body)

    wa = getattr(order, "whatsapp_number", None) or order.vodafone_number
    notify_customer_whatsapp(wa, order_status_message(order))


def init_notification_defaults(app: Flask) -> None:
    """Ensure notification setting keys exist (empty until configured)."""
    from models import Setting, db

    defaults = {
        "telegram_bot_token": app.config.get("TELEGRAM_BOT_TOKEN", ""),
        "telegram_chat_id": app.config.get("TELEGRAM_CHAT_ID", ""),
        "whatsapp_provider": app.config.get("WHATSAPP_PROVIDER", "callmebot"),
        "whatsapp_api_key": app.config.get("WHATSAPP_API_KEY", ""),
        "whatsapp_instance_id": app.config.get("WHATSAPP_INSTANCE_ID", ""),
        "whatsapp_webhook_url": app.config.get("WHATSAPP_WEBHOOK_URL", ""),
    }
    for key, value in defaults.items():
        if not Setting.query.filter_by(key=key).first():
            db.session.add(Setting(key=key, value=value or ""))
    db.session.commit()
