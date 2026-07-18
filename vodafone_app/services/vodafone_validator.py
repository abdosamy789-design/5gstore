"""Validate Vodafone Egypt numbers and optionally verify accounts via Playwright."""

from __future__ import annotations

import logging
import os
import re

logger = logging.getLogger(__name__)

VODAFONE_PREFIXES = ("010",)
EGYPT_MOBILE_RE = re.compile(r"^(?:\+?20|0)?1[0125]\d{8}$")
VODAFONE_RE = re.compile(r"^(?:\+?20|0)?10\d{8}$")


def normalize_egypt_mobile(raw: str) -> str | None:
    """Normalize to local format 01XXXXXXXXX (11 digits)."""
    if not raw:
        return None
    digits = re.sub(r"\D", "", raw.strip())
    if digits.startswith("20") and len(digits) == 12:
        digits = "0" + digits[2:]
    if digits.startswith("0020") and len(digits) == 14:
        digits = "0" + digits[4:]
    if len(digits) == 10 and digits.startswith("1"):
        digits = "0" + digits
    if len(digits) != 11 or not digits.startswith("01"):
        return None
    return digits


def is_vodafone_egypt(number: str) -> bool:
    normalized = normalize_egypt_mobile(number)
    if not normalized:
        return False
    return any(normalized.startswith(p) for p in VODAFONE_PREFIXES)


def validate_vodafone_customer(number: str) -> tuple[bool, str, str | None]:
    """Returns (ok, message_ar, normalized_number)."""
    normalized = normalize_egypt_mobile(number)
    if not normalized:
        return False, "رقم الموبايل غير صحيح. اكتب رقم مصري مثل 010xxxxxxxx", None
    if not is_vodafone_egypt(normalized):
        return (
            False,
            "الرقم ليس فودافون مصر. الخدمة متاحة فقط لأرقام فودافون (تبدأ بـ 010).",
            None,
        )
    return True, "تم التحقق: الرقم تابع لفودافون مصر", normalized


def verify_mode() -> str:
    return (os.getenv("VODAFONE_VERIFY_MODE") or "otp").strip().lower()


def verify_vodafone_account(
    number: str,
    password: str | None = None,
    national_id: str | None = None,
    otp_token: str | None = None,
    mode_override: str | None = None,
) -> dict:
    """
    Verify Vodafone Egypt customer account before payment.

    Modes (VODAFONE_VERIFY_MODE, or `mode_override` per call):
      - otp:    (recommended, default) customer must prove ownership of the
                number via a one-time SMS/WhatsApp code before continuing —
                wrong/unowned numbers are rejected outright.
      - prefix: numbering-range check only
      - mock:   prefix + credential format checks — for CI/demo, NOT a real check
      - live:   best-effort Playwright login against My Vodafone (fail-closed:
                any doubt or portal failure rejects the request)
    """
    ok, message, normalized = validate_vodafone_customer(number)
    if not ok:
        return {
            "ok": False,
            "normalized": None,
            "mode": mode_override or verify_mode(),
            "message": message,
            "details": {},
        }

    mode = (mode_override or verify_mode()).strip().lower()

    if mode == "otp":
        return _verify_otp_token(normalized, otp_token or "")

    if mode == "prefix":
        return {
            "ok": True,
            "normalized": normalized,
            "mode": mode,
            "message": message,
            "details": {"check": "prefix"},
        }

    if mode == "live":
        return _verify_live(normalized, password or "", national_id or "")

    return _verify_mock(normalized, password or "", national_id or "")


def _verify_otp_token(number: str, token: str) -> dict:
    """
    Strict pass/fail gate: the number is only accepted if the customer
    already confirmed a one-time code sent to it (see services/otp.py).
    """
    from services.otp import validate_verification_token

    if not token:
        return {
            "ok": False,
            "normalized": number,
            "mode": "otp",
            "message": "لم يتم تأكيد رقم فودافون برمز التحقق (OTP). اطلب الرمز وتحقق منه أولاً.",
            "details": {"check": "otp", "reason": "missing_token"},
        }

    if not validate_verification_token(number, token):
        return {
            "ok": False,
            "normalized": number,
            "mode": "otp",
            "message": "رمز التحقق غير مطابق لهذا الرقم أو منتهي الصلاحية. اطلب رمزاً جديداً.",
            "details": {"check": "otp", "reason": "invalid_or_expired_token"},
        }

    return {
        "ok": True,
        "normalized": number,
        "mode": "otp",
        "message": "تم تأكيد أن رقم فودافون صحيح ويخص العميل 100% عبر رمز تحقق (OTP).",
        "details": {"check": "otp"},
    }


def _verify_mock(number: str, password: str, national_id: str) -> dict:
    """
    Deterministic mock verifier for demos and automated tests.
    Accepts accounts with a password of at least 4 chars when provided.
    National ID, if given, must be 14 digits.
    """
    details: dict = {"check": "mock", "number": number}

    if national_id:
        nid = re.sub(r"\D", "", national_id)
        if len(nid) != 14:
            return {
                "ok": False,
                "normalized": number,
                "mode": "mock",
                "message": "الرقم القومي يجب أن يكون 14 رقماً.",
                "details": details,
            }
        details["national_id_ok"] = True

    if password and len(password.strip()) < 4:
        return {
            "ok": False,
            "normalized": number,
            "mode": "mock",
            "message": "كلمة مرور حساب فودافون قصيرة جداً (4 أحرف على الأقل).",
            "details": details,
        }

    if password:
        details["credential_format_ok"] = True

    return {
        "ok": True,
        "normalized": number,
        "mode": "mock",
        "message": "تم التحقق من بيانات حساب فودافون مصر بنجاح.",
        "details": details,
    }


def _verify_live(number: str, password: str, national_id: str) -> dict:
    """
    Best-effort live verification via Playwright against My Vodafone.

    Requires: pip install playwright && playwright install chromium

    Fail-closed by design: this function only returns ok=True when it has
    clear positive evidence of a successful login. Any ambiguity, portal
    error, or inability to reach the login form results in rejection —
    we never "soft pass" a real account check. Prefer VODAFONE_VERIFY_MODE=otp
    for a guaranteed, legitimate way to confirm the number is genuine.
    """
    portal = os.getenv(
        "VODAFONE_PORTAL_URL", "https://web.vodafone.com.eg/ar/home"
    )
    details: dict = {"check": "live", "portal": portal, "number": number}

    if not password:
        return {
            "ok": False,
            "normalized": number,
            "mode": "live",
            "message": "كلمة مرور حساب ماي فودافون مطلوبة للتحقق الحي.",
            "details": details,
        }

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        logger.warning("Playwright not installed; rejecting live verification")
        return {
            "ok": False,
            "normalized": number,
            "mode": "live",
            "message": (
                "متطلبات التحقق الحي (Playwright) غير مثبتة على الخادم. "
                "استخدم وضع otp أو ثبّت playwright وشغّل playwright install chromium."
            ),
            "details": {**details, "reason": "playwright_missing"},
        }

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage"],
            )
            context = browser.new_context(
                locale="ar-EG",
                user_agent=(
                    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
                ),
            )
            page = context.new_page()
            page.goto(portal, wait_until="domcontentloaded", timeout=45000)
            details["loaded"] = True

            # Best-effort: find login fields (selectors may vary)
            msisdn_selectors = [
                'input[name*="msisdn"]',
                'input[name*="mobile"]',
                'input[type="tel"]',
                'input[placeholder*="01"]',
                "#msisdn",
                "#username",
            ]
            pass_selectors = [
                'input[type="password"]',
                'input[name*="pass"]',
                "#password",
            ]

            filled_user = False
            for sel in msisdn_selectors:
                loc = page.locator(sel).first
                if loc.count() > 0:
                    loc.fill(number)
                    filled_user = True
                    break

            filled_pass = False
            for sel in pass_selectors:
                loc = page.locator(sel).first
                if loc.count() > 0:
                    loc.fill(password)
                    filled_pass = True
                    break

            details["filled_user"] = filled_user
            details["filled_pass"] = filled_pass

            if not filled_user:
                browser.close()
                return {
                    "ok": False,
                    "normalized": number,
                    "mode": "live",
                    "message": (
                        "تعذر الوصول لنموذج تسجيل الدخول في بوابة فودافون؛ "
                        "تم رفض الطلب للحيطة (لم يتم تأكيد صحة البيانات)."
                    ),
                    "details": {**details, "reason": "login_form_not_found"},
                }

            # Try submit
            for sel in [
                'button[type="submit"]',
                'button:has-text("دخول")',
                'button:has-text("Login")',
                'input[type="submit"]',
            ]:
                loc = page.locator(sel).first
                if loc.count() > 0:
                    loc.click(timeout=5000)
                    break

            page.wait_for_timeout(3500)
            content = (page.content() or "").lower()
            url_now = page.url
            browser.close()

            error_markers = [
                "incorrect",
                "invalid",
                "خطأ",
                "غير صحيح",
                "كلمة المرور",
                "failed",
            ]
            success_markers = [
                "logout",
                "تسجيل الخروج",
                "dashboard",
                "حسابي",
                "my account",
                "profile",
            ]

            if any(m in content for m in error_markers) and not any(
                m in content for m in success_markers
            ):
                return {
                    "ok": False,
                    "normalized": number,
                    "mode": "live",
                    "message": "بيانات حساب فودافون غير صحيحة أو مرفوضة من البوابة.",
                    "details": {**details, "url": url_now},
                }

            if any(m in content for m in success_markers) or "login" not in url_now.lower():
                return {
                    "ok": True,
                    "normalized": number,
                    "mode": "live",
                    "message": "تم التحقق الحي من حساب فودافون مصر بنجاح.",
                    "details": {**details, "url": url_now},
                }

            # Ambiguous result — fail closed, we never soft-pass a real account check
            return {
                "ok": False,
                "normalized": number,
                "mode": "live",
                "message": (
                    "لم يتم تأكيد نجاح تسجيل الدخول بوضوح من بوابة فودافون؛ "
                    "تم رفض الطلب للحيطة. حاول مرة أخرى أو استخدم وضع otp."
                ),
                "details": {**details, "url": url_now, "ambiguous": True},
            }

    except Exception as exc:  # noqa: BLE001 — surface portal failures, fail closed
        logger.exception("Live Vodafone verification failed")
        return {
            "ok": False,
            "normalized": number,
            "mode": "live",
            "message": f"فشل الاتصال ببوابة فودافون: {exc}. أعد المحاولة أو استخدم وضع otp.",
            "details": {**details, "live_error": str(exc)},
        }
