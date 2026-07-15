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
    return (os.getenv("VODAFONE_VERIFY_MODE") or "mock").strip().lower()


def verify_vodafone_account(
    number: str,
    password: str | None = None,
    national_id: str | None = None,
) -> dict:
    """
    Verify Vodafone Egypt customer account before payment.

    Modes (VODAFONE_VERIFY_MODE):
      - prefix: numbering-range check only
      - mock:   prefix + credential format checks (default / CI-safe)
      - live:   Playwright against My Vodafone portal
    """
    ok, message, normalized = validate_vodafone_customer(number)
    if not ok:
        return {
            "ok": False,
            "normalized": None,
            "mode": verify_mode(),
            "message": message,
            "details": {},
        }

    mode = verify_mode()
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
    Attempt live verification via Playwright against My Vodafone.

    Requires: pip install playwright && playwright install chromium
    Portal UI changes may require selector updates — failures fall back
    gracefully with a clear Arabic message.
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
        logger.warning("Playwright not installed; falling back to mock")
        return _verify_mock(number, password, national_id)

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
                # Portal layout unknown — accept prefix + credential presence
                fallback = _verify_mock(number, password, national_id)
                fallback["message"] = (
                    "تعذر الوصول لنموذج تسجيل الدخول؛ تم التحقق الأساسي من الرقم."
                )
                fallback["details"] = {**details, **fallback["details"]}
                fallback["mode"] = "live"
                return fallback

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
                    "message": "تم التحقق الحي من حساب فودافون مصر.",
                    "details": {**details, "url": url_now},
                }

            # Ambiguous — treat as soft pass with note
            return {
                "ok": True,
                "normalized": number,
                "mode": "live",
                "message": "تم إرسال بيانات الحساب للبوابة؛ لم يُرصد رفض صريح.",
                "details": {**details, "url": url_now, "ambiguous": True},
            }

    except Exception as exc:  # noqa: BLE001 — surface portal failures to UI
        logger.exception("Live Vodafone verification failed")
        fallback = _verify_mock(number, password, national_id)
        if fallback["ok"]:
            fallback["message"] = (
                "تعذر الاتصال ببوابة فودافون حالياً؛ تم قبول التحقق الأساسي من الرقم."
            )
            fallback["details"] = {"live_error": str(exc), **fallback["details"]}
            fallback["mode"] = "live"
            return fallback
        return {
            "ok": False,
            "normalized": number,
            "mode": "live",
            "message": f"فشل التحقق الحي: {exc}",
            "details": details,
        }
