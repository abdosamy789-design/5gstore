"""Payment gateway: parse Vodafone Cash SMS and match pending orders."""

from __future__ import annotations

import re
from datetime import datetime, timezone

from models import Order, PaymentEvent, db
from services.vodafone_validator import normalize_egypt_mobile


# Common Vodafone Cash SMS patterns (Arabic / English variations)
AMOUNT_PATTERNS = [
    re.compile(r"(?:EGP|ج\.?\s*م\.?|جنيه)\s*([0-9]+(?:[.,][0-9]+)?)", re.I),
    re.compile(r"([0-9]+(?:[.,][0-9]+)?)\s*(?:EGP|ج\.?\s*م\.?|جنيه)", re.I),
    re.compile(r"(?:amount|مبلغ|بمبلغ)\s*[:=]?\s*([0-9]+(?:[.,][0-9]+)?)", re.I),
]

SENDER_PATTERNS = [
    re.compile(
        r"(?:from|من|المرسل|رقم)\s*[:=]?\s*((?:\+?20|0)?1[0125]\d{8})", re.I
    ),
    re.compile(r"((?:\+?20|0)?10\d{8})"),
]


def parse_payment_sms(raw_message: str) -> tuple[str | None, float | None]:
    """Extract sender mobile and amount from an incoming SMS body."""
    text = (raw_message or "").strip()
    sender = None
    amount = None

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

    return sender, amount


def ingest_payment_message(
    raw_message: str,
    sender_hint: str | None = None,
    amount_hint: float | None = None,
) -> dict:
    """
    Store SMS event and try to auto-match a pending order.

    Matching rules:
    1. Prefer orders with status payment_submitted whose sender_number matches.
    2. Fall back to awaiting_payment / payment_submitted with same amount.
    """
    parsed_sender, parsed_amount = parse_payment_sms(raw_message)
    sender = normalize_egypt_mobile(sender_hint or "") or parsed_sender
    amount = amount_hint if amount_hint is not None else parsed_amount

    event = PaymentEvent(
        raw_message=raw_message,
        sender_number=sender or "",
        amount=amount,
        matched=False,
    )
    db.session.add(event)
    db.session.flush()

    order = _find_matching_order(sender, amount)
    result = {
        "event_id": event.id,
        "sender_number": sender,
        "amount": amount,
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
                # Soft match: amount matches and customer may still fill sender
                if not order.sender_number or order.sender_number == sender:
                    return order

    if amount is not None and len(candidates) == 1:
        only = candidates[0]
        if abs(only.amount - amount) < 0.01:
            return only

    return None
