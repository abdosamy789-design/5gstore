"""P2P SMS payment gateway: Vodafone Cash, InstaPay, and other wallets."""

from __future__ import annotations

import re
from datetime import datetime, timezone

from models import Order, PaymentEvent, db
from services.vodafone_validator import normalize_egypt_mobile

AMOUNT_PATTERNS = [
    re.compile(r"(?:EGP|ج\.?\s*م\.?|جنيه|جنيهاً?)\s*([0-9]+(?:[.,][0-9]+)?)", re.I),
    re.compile(r"([0-9]+(?:[.,][0-9]+)?)\s*(?:EGP|ج\.?\s*م\.?|جنيه|جنيهاً?)", re.I),
    re.compile(r"(?:amount|مبلغ|بمبلغ|قيمة)\s*[:=]?\s*([0-9]+(?:[.,][0-9]+)?)", re.I),
    re.compile(r"(?:InstaPay|إنستاباي|انستا باي).{0,40}?([0-9]+(?:[.,][0-9]+)?)", re.I),
]

SENDER_PATTERNS = [
    re.compile(
        r"(?:from|من|المرسل|رقم|المحفظة|wallet)\s*[:=]?\s*((?:\+?20|0)?1[0125]\d{8})",
        re.I,
    ),
    re.compile(r"((?:\+?20|0)?1[0125]\d{8})"),
]

TXN_PATTERNS = [
    re.compile(
        r"(?:Txn|TXN|Ref|Reference|رقم العملية|العملية|معاملة|transaction)\s*[#::=\-]?\s*([A-Z0-9\-]{6,})",
        re.I,
    ),
]

PROVIDER_HINTS = [
    ("instapay", ("instapay", "إنستاباي", "انستا باي", "insta pay", "cib")),
    ("vodafone_cash", ("vodafone cash", "فودافون كاش", "vf cash", "vodafone")),
    ("orange_cash", ("orange cash", "أورنج كاش", "اورنج كاش")),
    ("etisalat_cash", ("etisalat cash", "اتصالات كاش", "e& cash", "etisalat")),
    ("we_pay", ("we pay", "وي باي", "we cash")),
]


def detect_provider(raw_message: str, sender_app: str | None = None) -> str:
    blob = f"{sender_app or ''} {raw_message or ''}".lower()
    for code, hints in PROVIDER_HINTS:
        if any(h.lower() in blob for h in hints):
            return code
    return "unknown"


def parse_payment_sms(raw_message: str) -> tuple[str | None, float | None, str | None]:
    """Extract sender mobile, amount, and transaction reference from SMS body."""
    text = (raw_message or "").strip()
    sender = None
    amount = None
    txn = None

    for pattern in SENDER_PATTERNS:
        match = pattern.search(text)
        if match:
            sender = normalize_egypt_mobile(match.group(1))
            if sender:
                break

    for pattern in AMOUNT_PATTERNS:
        match = pattern.search(text)
        if match:
            try:
                amount = float(match.group(1).replace(",", "."))
                break
            except ValueError:
                continue

    for pattern in TXN_PATTERNS:
        match = pattern.search(text)
        if match:
            txn = match.group(1).strip()
            break

    return sender, amount, txn


def ingest_payment_message(
    raw_message: str,
    sender_hint: str | None = None,
    amount_hint: float | None = None,
    provider_hint: str | None = None,
    txn_hint: str | None = None,
    sender_app: str | None = None,
) -> dict:
    """
    Store SMS/P2P event and auto-match a pending order.

    Matching (رقم المحول + المبلغ):
    1. Orders with payment_submitted whose sender_number matches + amount
    2. Soft match on amount when only one pending order or sender empty
    """
    parsed_sender, parsed_amount, parsed_txn = parse_payment_sms(raw_message)
    sender = normalize_egypt_mobile(sender_hint or "") or parsed_sender
    amount = amount_hint if amount_hint is not None else parsed_amount
    txn = (txn_hint or parsed_txn or "").strip()
    provider = (provider_hint or detect_provider(raw_message, sender_app)).lower()

    event = PaymentEvent(
        raw_message=raw_message,
        sender_number=sender or "",
        amount=amount,
        provider=provider,
        transaction_ref=txn,
        matched=False,
    )
    db.session.add(event)
    db.session.flush()

    order = _find_matching_order(sender, amount)
    result = {
        "event_id": event.id,
        "sender_number": sender,
        "amount": amount,
        "provider": provider,
        "transaction_ref": txn or None,
        "matched": False,
        "order_id": None,
        "order_reference": None,
    }

    if order:
        order.status = "paid"
        order.payment_matched_at = datetime.now(timezone.utc)
        if sender and not order.sender_number:
            order.sender_number = sender
        event.matched = True
        event.order_id = order.id
        result.update(
            {
                "matched": True,
                "order_id": order.id,
                "order_reference": order.reference,
            }
        )

    db.session.commit()

    if order and result["matched"]:
        try:
            from services.notifications import notify_order_update
            from services.wallet_rotation import record_wallet_receipt

            record_wallet_receipt(order.cash_wallet_id, order.amount)
            notify_order_update(order, event="payment_matched")
        except Exception:  # noqa: BLE001
            pass

    return result


def _find_matching_order(sender: str | None, amount: float | None) -> Order | None:
    candidates = (
        Order.query.filter(Order.status.in_(["awaiting_payment", "payment_submitted"]))
        .order_by(Order.created_at.asc())
        .all()
    )
    if not candidates:
        return None

    if sender:
        for order in candidates:
            if order.sender_number and order.sender_number == sender:
                if amount is None or abs(order.amount - amount) < 0.01:
                    return order

    if sender and amount is not None:
        for order in candidates:
            if abs(order.amount - amount) < 0.01:
                if not order.sender_number or order.sender_number == sender:
                    return order

    if amount is not None and len(candidates) == 1:
        only = candidates[0]
        if abs(only.amount - amount) < 0.01:
            return only

    return None
