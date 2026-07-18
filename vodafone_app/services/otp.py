"""Strict OTP verification proving real ownership of a Vodafone number.

This is the recommended way to guarantee customer data is genuinely correct:
we text a one-time code to the exact number the customer entered. If the
number is wrong / not theirs, they never receive the code and verification
fails; if they enter the correct code, ownership is proven and the flow
continues. This avoids the legal/technical risk of scripting logins against
Vodafone's real customer-password portal (see `_verify_live` for that
best-effort alternative).
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import random
from datetime import datetime, timedelta, timezone

from itsdangerous import BadSignature, SignatureExpired, TimestampSigner

from services.vodafone_validator import normalize_egypt_mobile, validate_vodafone_customer

logger = logging.getLogger(__name__)

OTP_TTL_SECONDS = 5 * 60
RESEND_COOLDOWN_SECONDS = 45
MAX_ATTEMPTS = 5
TOKEN_TTL_SECONDS = 30 * 60
TOKEN_SALT = "vodafone-otp-verified-v1"


def _secret() -> str:
    return os.getenv("SECRET_KEY", "dev-secret-change-me")


def _signer() -> TimestampSigner:
    return TimestampSigner(_secret(), salt=TOKEN_SALT)


def _hash_code(phone: str, code: str) -> str:
    return hmac.new(
        _secret().encode("utf-8"), f"{phone}:{code}".encode("utf-8"), hashlib.sha256
    ).hexdigest()


def issue_verification_token(phone: str) -> str:
    token = _signer().sign(phone.encode("utf-8"))
    return token.decode("utf-8") if isinstance(token, bytes) else token


def validate_verification_token(phone: str | None, token: str | None) -> bool:
    if not phone or not token:
        return False
    try:
        value = _signer().unsign(token, max_age=TOKEN_TTL_SECONDS)
    except (BadSignature, SignatureExpired):
        return False
    if isinstance(value, bytes):
        value = value.decode("utf-8")
    return value == phone


def request_otp(number: str) -> dict:
    """Generate and send a 6-digit OTP to a Vodafone Egypt number."""
    from models import OtpChallenge, db

    ok, message, normalized = validate_vodafone_customer(number)
    if not ok:
        return {"ok": False, "message": message}

    now = datetime.now(timezone.utc)
    recent = (
        OtpChallenge.query.filter_by(phone=normalized)
        .order_by(OtpChallenge.created_at.desc())
        .first()
    )
    if recent:
        created_at = recent.created_at
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        elapsed = (now - created_at).total_seconds()
        if elapsed < RESEND_COOLDOWN_SECONDS:
            wait = int(RESEND_COOLDOWN_SECONDS - elapsed)
            return {"ok": False, "message": f"انتظر {wait} ثانية قبل طلب رمز جديد."}

    code = f"{random.randint(0, 999999):06d}"
    challenge = OtpChallenge(
        phone=normalized,
        code_hash=_hash_code(normalized, code),
        attempts=0,
        verified=False,
        expires_at=now + timedelta(seconds=OTP_TTL_SECONDS),
    )
    db.session.add(challenge)
    db.session.commit()

    delivered = _deliver_code(normalized, code)
    result = {
        "ok": True,
        "message": (
            "تم إرسال رمز التحقق إلى رقمك. اكتبه هنا لتأكيد الرقم."
            if delivered
            else "تم إنشاء الرمز لكن تعذر إرسال SMS/واتساب — راجع إعدادات الإشعارات مع المدير."
        ),
        "delivered": delivered,
        "expires_in": OTP_TTL_SECONDS,
        "normalized": normalized,
    }
    # Development/testing only: never enabled by default, never exposes the
    # plaintext code in production unless an operator explicitly opts in.
    if (os.getenv("OTP_DEBUG_ECHO") or "").strip() == "1":
        result["debug_code"] = code
    return result


def _deliver_code(phone: str, code: str) -> bool:
    from services.notifications import notify_customer_whatsapp, send_sms

    text = (
        f"رمز تحقق فودافون ريد: {code}\n"
        f"صالح لمدة 5 دقائق. لا تشارك هذا الرمز مع أي شخص."
    )
    sent = send_sms(phone, text)
    if not sent:
        sent = notify_customer_whatsapp(phone, text)
    return sent


def confirm_otp(number: str, code: str) -> dict:
    """Verify the code the customer received. Strict: wrong code = rejected."""
    from models import OtpChallenge, db

    normalized = normalize_egypt_mobile(number)
    if not normalized:
        return {"ok": False, "message": "رقم الموبايل غير صحيح."}

    challenge = (
        OtpChallenge.query.filter_by(phone=normalized, verified=False)
        .order_by(OtpChallenge.created_at.desc())
        .first()
    )
    now = datetime.now(timezone.utc)
    if not challenge:
        return {
            "ok": False,
            "message": "لم يتم إرسال رمز تحقق لهذا الرقم. اطلب رمزاً جديداً.",
        }

    expires_at = challenge.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now:
        return {"ok": False, "message": "انتهت صلاحية الرمز. اطلب رمزاً جديداً."}
    if challenge.attempts >= MAX_ATTEMPTS:
        return {
            "ok": False,
            "message": "تجاوزت عدد المحاولات المسموح به. اطلب رمزاً جديداً.",
        }

    code = (code or "").strip()
    expected = _hash_code(normalized, code)
    challenge.attempts += 1

    if not code or not hmac.compare_digest(expected, challenge.code_hash):
        db.session.commit()
        remaining = max(0, MAX_ATTEMPTS - challenge.attempts)
        return {
            "ok": False,
            "message": f"رمز التحقق غير صحيح. متبقي {remaining} محاولات.",
        }

    challenge.verified = True
    db.session.commit()

    return {
        "ok": True,
        "message": "تم تأكيد أن الرقم صحيح ويخصك 100%.",
        "token": issue_verification_token(normalized),
        "normalized": normalized,
    }
