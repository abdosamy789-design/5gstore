"""Customer internal wallet credits/debits."""

from __future__ import annotations

from models import CustomerWallet, WalletLedger, db
from services.vodafone_validator import normalize_egypt_mobile


def get_or_create_wallet(phone: str, name: str = "") -> CustomerWallet:
    normalized = normalize_egypt_mobile(phone) or (phone or "").strip()
    if not normalized:
        raise ValueError("invalid phone for wallet")
    wallet = CustomerWallet.query.filter_by(phone=normalized).first()
    if wallet:
        if name and not wallet.name:
            wallet.name = name
            db.session.commit()
        return wallet
    wallet = CustomerWallet(phone=normalized, name=name or "", balance=0.0)
    db.session.add(wallet)
    db.session.commit()
    return wallet


def credit_wallet_for_phone(
    phone: str,
    amount: float,
    name: str = "",
    reason: str = "credit",
    order_id: int | None = None,
) -> CustomerWallet:
    wallet = get_or_create_wallet(phone, name=name)
    amount = float(amount)
    if amount <= 0:
        return wallet
    wallet.balance = float(wallet.balance or 0) + amount
    db.session.add(
        WalletLedger(
            wallet_id=wallet.id,
            amount=amount,
            balance_after=wallet.balance,
            reason=reason,
            order_id=order_id,
        )
    )
    db.session.commit()
    return wallet


def debit_wallet(
    wallet: CustomerWallet,
    amount: float,
    reason: str = "debit",
    order_id: int | None = None,
) -> CustomerWallet:
    amount = float(amount)
    if amount <= 0:
        raise ValueError("amount must be positive")
    if float(wallet.balance or 0) + 1e-9 < amount:
        raise ValueError("insufficient wallet balance")
    wallet.balance = float(wallet.balance or 0) - amount
    db.session.add(
        WalletLedger(
            wallet_id=wallet.id,
            amount=-amount,
            balance_after=wallet.balance,
            reason=reason,
            order_id=order_id,
        )
    )
    db.session.commit()
    return wallet
