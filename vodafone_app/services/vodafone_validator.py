"""Validate Vodafone Egypt mobile numbers."""

from __future__ import annotations

import re

# Vodafone Egypt primary prefix is 010 (11 digits total including leading 0)
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
    """
    Confirm the number belongs to Vodafone Egypt by prefix.

    Official live HLR/operator lookup requires Vodafone commercial APIs.
    This checks the public Vodafone Egypt numbering range (010).
    """
    normalized = normalize_egypt_mobile(number)
    if not normalized:
        return False
    return any(normalized.startswith(p) for p in VODAFONE_PREFIXES)


def validate_vodafone_customer(number: str) -> tuple[bool, str, str | None]:
    """
    Returns (ok, message_ar, normalized_number).
    """
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
