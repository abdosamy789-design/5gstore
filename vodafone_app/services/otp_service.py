"""OTP-based Vodafone line ownership verification.

Proves the customer controls the handset/SIM — without collecting Ana Vodafone passwords
or logging into Vodafone's website.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

import urllib.request
import json

from models import LineChallenge, db


OTP_TTL_MINUTES = 10
OTP_LENGTH = 6
MAX_ATTEMPTS = 5


def _utcnow():
    return datetime.now(timezone.utc)


def generate_otp() -> str:
    return "".join(str(secrets.randbelow(10)) for _ in range(OTP_LENGTH))


def create_challenge(vodafone_number: str, customer_name: str = "") -> LineChallenge:
    """Create or refresh an OTP challenge for a Vodafone number."""
    # Invalidate previous open challenges for this number
    LineChallenge.query.filter_by(
        vodafone_number=vodafone_number, verified=False
    ).update({"expires_at": _utcnow() - timedelta(seconds=1)})

    code = generate_otp()
    challenge = LineChallenge(
        token=secrets.token_urlsafe(24),
        vodafone_number=vodafone_number,
        customer_name=customer_name,
        otp_code=code,
        expires_at=_utcnow() + timedelta(minutes=OTP_TTL_MINUTES),
        attempts=0,
        verified=False,
    )
    db.session.add(challenge)
    db.session.commit()
    return challenge


def send_otp_sms(
    number: str,
    code: str,
    *,
    mode: str = "demo",
    sms_url: str = "",
) -> tuple[bool, str]:
    """
    Deliver OTP.

    Modes:
      - demo: no external SMS; caller shows code on-screen for testing
      - http: POST JSON {\"to\": number, \"message\": ...} to sms_url
    """
    message = f"رمز التحقق لطلب فودافون ريد: {code} (صالح {OTP_TTL_MINUTES} دقائق)"

    if mode == "http":
        if not sms_url:
            return False, "لم يتم ضبط رابط بوابة الرسائل (SMS)"
        payload = json.dumps({"to": number, "message": message, "otp": code}).encode()
        req = urllib.request.Request(
            sms_url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                if 200 <= resp.status < 300:
                    return True, "تم إرسال رمز التحقق على رقمك"
                return False, f"فشل إرسال الرسالة (كود {resp.status})"
        except Exception as exc:  # noqa: BLE001 — surface to UI
            return False, f"تعذر الاتصال ببوابة الرسائل: {exc}"

    # demo / console
    return True, "وضع تجريبي: سيظهر الرمز في الصفحة (اربط بوابة SMS لاحقاً)"


def verify_otp(token: str, code: str) -> tuple[bool, str, LineChallenge | None]:
    challenge = LineChallenge.query.filter_by(token=token).first()
    if not challenge:
        return False, "جلسة التحقق غير موجودة. ابدأ من جديد.", None

    if challenge.verified:
        return True, "تم التحقق مسبقاً", challenge

    if challenge.expires_at.replace(tzinfo=timezone.utc) < _utcnow():
        return False, "انتهت صلاحية الرمز. اطلب رمزاً جديداً.", challenge

    if challenge.attempts >= MAX_ATTEMPTS:
        return False, "تم تجاوز عدد المحاولات. اطلب رمزاً جديداً.", challenge

    challenge.attempts += 1
    if (code or "").strip() != challenge.otp_code:
        db.session.commit()
        left = MAX_ATTEMPTS - challenge.attempts
        return False, f"الرمز غير صحيح. متبقي {left} محاولة.", challenge

    challenge.verified = True
    challenge.verified_at = _utcnow()
    db.session.commit()
    return True, "تم التحقق: الرقم صحيح وأنت تمتلك الخط", challenge
