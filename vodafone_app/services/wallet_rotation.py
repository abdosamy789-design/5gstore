"""Cash wallet rotation based on daily/monthly receiving limits."""

from __future__ import annotations

from datetime import datetime, timezone

from models import CashWallet, db


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def refresh_wallet_period(wallet: CashWallet) -> None:
    day = _today()
    month = _month()
    if wallet.last_reset_day != day:
        wallet.received_today = 0.0
        wallet.last_reset_day = day
    if wallet.last_reset_month != month:
        wallet.received_month = 0.0
        wallet.last_reset_month = month


def refresh_all_wallet_periods() -> dict:
    wallets = CashWallet.query.all()
    for w in wallets:
        refresh_wallet_period(w)
    db.session.commit()
    return {"ok": True, "wallets": len(wallets)}


def assign_receiving_wallet(amount: float) -> CashWallet | None:
    """
    Pick the best active wallet that can still accept `amount`.
    Preference: higher priority (lower number), then most remaining daily capacity.
    """
    amount = float(amount or 0)
    wallets = (
        CashWallet.query.filter_by(is_active=True)
        .order_by(CashWallet.priority.asc(), CashWallet.id.asc())
        .all()
    )
    if not wallets:
        return None

    eligible: list[CashWallet] = []
    for wallet in wallets:
        refresh_wallet_period(wallet)
        if wallet.can_accept(amount):
            eligible.append(wallet)

    if not eligible:
        # Soft fallback: least loaded active wallet even if near limit
        for wallet in wallets:
            refresh_wallet_period(wallet)
        wallets.sort(key=lambda w: (w.received_today or 0, w.priority, w.id))
        chosen = wallets[0]
        db.session.commit()
        return chosen

    # Prefer wallets with the most remaining daily capacity, then priority
    eligible.sort(key=lambda w: (-w.remaining_today(), w.priority, w.id))
    chosen = eligible[0]
    db.session.commit()
    return chosen


def record_wallet_receipt(wallet_id: int | None, amount: float) -> None:
    if not wallet_id:
        return
    wallet = CashWallet.query.get(wallet_id)
    if not wallet:
        return
    refresh_wallet_period(wallet)
    wallet.received_today = float(wallet.received_today or 0) + float(amount)
    wallet.received_month = float(wallet.received_month or 0) + float(amount)
    db.session.commit()


def seed_cash_wallet_from_setting(number: str, label: str = "المحفظة الرئيسية") -> CashWallet | None:
    if not number:
        return None
    existing = CashWallet.query.filter_by(number=number).first()
    if existing:
        return existing
    wallet = CashWallet(
        label=label,
        number=number,
        provider="vodafone_cash",
        daily_limit=50000,
        monthly_limit=500000,
        priority=1,
        is_active=True,
        last_reset_day=_today(),
        last_reset_month=_month(),
    )
    db.session.add(wallet)
    db.session.commit()
    return wallet
