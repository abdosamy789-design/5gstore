"""Fernet encryption for sensitive account fields at rest."""

from __future__ import annotations

import base64
import hashlib
import os

from cryptography.fernet import Fernet, InvalidToken


def _fernet() -> Fernet:
    raw = os.getenv("ENCRYPTION_KEY", "").strip()
    if raw:
        # Accept either a Fernet key or any passphrase
        try:
            return Fernet(raw.encode() if isinstance(raw, str) else raw)
        except (ValueError, TypeError):
            digest = hashlib.sha256(raw.encode("utf-8")).digest()
            return Fernet(base64.urlsafe_b64encode(digest))

    secret = os.getenv("SECRET_KEY", "dev-secret-change-me")
    digest = hashlib.sha256(f"vf-red-enc:{secret}".encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_text(plain: str | None) -> str:
    if not plain:
        return ""
    return _fernet().encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt_text(token: str | None) -> str:
    if not token:
        return ""
    try:
        return _fernet().decrypt(token.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError, TypeError):
        # Legacy plaintext rows (pre-encryption) remain readable
        return token
