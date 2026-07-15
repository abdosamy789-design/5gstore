"""Reseller prepaid balance helpers."""

from __future__ import annotations

from models import Reseller, ResellerLedger, db


def credit_reseller(
    reseller: Reseller,
    amount: float,
    reason: str = "topup",
    order_id: int | None = None,
) -> Reseller:
    amount = float(amount)
    if amount <= 0:
        raise ValueError("amount must be positive")
    reseller.balance = float(reseller.balance or 0) + amount
    db.session.add(
        ResellerLedger(
            reseller_id=reseller.id,
            amount=amount,
            balance_after=reseller.balance,
            reason=reason,
            order_id=order_id,
        )
    )
    db.session.commit()
    return reseller


def debit_reseller(
    reseller: Reseller,
    amount: float,
    reason: str = "order",
    order_id: int | None = None,
) -> Reseller:
    amount = float(amount)
    if amount <= 0:
        raise ValueError("amount must be positive")
    if float(reseller.balance or 0) + 1e-9 < amount:
        raise ValueError("insufficient reseller balance")
    reseller.balance = float(reseller.balance or 0) - amount
    db.session.add(
        ResellerLedger(
            reseller_id=reseller.id,
            amount=-amount,
            balance_after=reseller.balance,
            reason=reason,
            order_id=order_id,
        )
    )
    db.session.commit()
    return reseller
