from datetime import datetime, timezone

from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import check_password_hash, generate_password_hash

from services.crypto import decrypt_text, encrypt_text

db = SQLAlchemy()


def utcnow():
    return datetime.now(timezone.utc)


class Admin(db.Model):
    __tablename__ = "admins"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)


class Setting(db.Model):
    __tablename__ = "settings"

    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(80), unique=True, nullable=False)
    value = db.Column(db.Text, nullable=False)


class Package(db.Model):
    __tablename__ = "packages"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text, default="")
    price = db.Column(db.Float, nullable=False)
    wholesale_price = db.Column(db.Float, nullable=True)
    data_gb = db.Column(db.Float, default=0)
    minutes = db.Column(db.Integer, default=0)
    validity_days = db.Column(db.Integer, default=30)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=utcnow)

    orders = db.relationship("Order", back_populates="package")

    def price_for(self, reseller: "Reseller | None" = None) -> float:
        if reseller and self.wholesale_price is not None and self.wholesale_price > 0:
            return float(self.wholesale_price)
        return float(self.price)


class Reseller(db.Model):
    """B2B prepaid reseller account."""

    __tablename__ = "resellers"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    company_name = db.Column(db.String(120), default="")
    phone = db.Column(db.String(20), default="")
    balance = db.Column(db.Float, default=0.0)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=utcnow)

    orders = db.relationship("Order", back_populates="reseller")
    ledger = db.relationship("ResellerLedger", back_populates="reseller", lazy="dynamic")

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)


class ResellerLedger(db.Model):
    __tablename__ = "reseller_ledger"

    id = db.Column(db.Integer, primary_key=True)
    reseller_id = db.Column(db.Integer, db.ForeignKey("resellers.id"), nullable=False)
    amount = db.Column(db.Float, nullable=False)  # +credit / -debit
    balance_after = db.Column(db.Float, nullable=False)
    reason = db.Column(db.String(120), default="")
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow)

    reseller = db.relationship("Reseller", back_populates="ledger")


class CustomerWallet(db.Model):
    """Internal prepaid wallet keyed by customer phone."""

    __tablename__ = "customer_wallets"

    id = db.Column(db.Integer, primary_key=True)
    phone = db.Column(db.String(20), unique=True, nullable=False)
    name = db.Column(db.String(120), default="")
    balance = db.Column(db.Float, default=0.0)
    created_at = db.Column(db.DateTime, default=utcnow)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)

    ledger = db.relationship("WalletLedger", back_populates="wallet", lazy="dynamic")
    orders = db.relationship("Order", back_populates="customer_wallet")


class WalletLedger(db.Model):
    __tablename__ = "wallet_ledger"

    id = db.Column(db.Integer, primary_key=True)
    wallet_id = db.Column(db.Integer, db.ForeignKey("customer_wallets.id"), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    balance_after = db.Column(db.Float, nullable=False)
    reason = db.Column(db.String(120), default="")
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow)

    wallet = db.relationship("CustomerWallet", back_populates="ledger")


class CashWallet(db.Model):
    """Receiving cash wallets with daily/monthly rotation limits."""

    __tablename__ = "cash_wallets"

    id = db.Column(db.Integer, primary_key=True)
    label = db.Column(db.String(80), default="")
    number = db.Column(db.String(20), unique=True, nullable=False)
    provider = db.Column(db.String(40), default="vodafone_cash")
    daily_limit = db.Column(db.Float, default=50000)
    monthly_limit = db.Column(db.Float, default=500000)
    received_today = db.Column(db.Float, default=0.0)
    received_month = db.Column(db.Float, default=0.0)
    last_reset_day = db.Column(db.String(10), default="")  # YYYY-MM-DD
    last_reset_month = db.Column(db.String(7), default="")  # YYYY-MM
    priority = db.Column(db.Integer, default=100)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=utcnow)

    orders = db.relationship("Order", back_populates="cash_wallet")

    def remaining_today(self) -> float:
        return max(0.0, float(self.daily_limit) - float(self.received_today or 0))

    def remaining_month(self) -> float:
        return max(0.0, float(self.monthly_limit) - float(self.received_month or 0))

    def can_accept(self, amount: float) -> bool:
        return self.remaining_today() >= amount and self.remaining_month() >= amount


class Order(db.Model):
    __tablename__ = "orders"

    id = db.Column(db.Integer, primary_key=True)
    reference = db.Column(db.String(32), unique=True, nullable=False)

    customer_name = db.Column(db.String(120), nullable=False)
    vodafone_number = db.Column(db.String(20), nullable=False)
    whatsapp_number = db.Column(db.String(20), default="")

    _national_id = db.Column("national_id", db.Text, default="")
    _account_password = db.Column("account_password", db.Text, default="")

    account_verified = db.Column(db.Boolean, default=False)
    verification_mode = db.Column(db.String(20), default="")
    verification_message = db.Column(db.Text, default="")
    verification_task_id = db.Column(db.String(80), default="")

    package_id = db.Column(db.Integer, db.ForeignKey("packages.id"), nullable=False)
    amount = db.Column(db.Float, nullable=False)

    pay_to_number = db.Column(db.String(20), nullable=False, default="")
    instapay_address = db.Column(db.String(120), default="")
    sender_number = db.Column(db.String(20), default="")
    cash_wallet_id = db.Column(db.Integer, db.ForeignKey("cash_wallets.id"), nullable=True)

    reseller_id = db.Column(db.Integer, db.ForeignKey("resellers.id"), nullable=True)
    customer_wallet_id = db.Column(
        db.Integer, db.ForeignKey("customer_wallets.id"), nullable=True
    )
    paid_from_wallet = db.Column(db.Boolean, default=False)

    status = db.Column(db.String(30), default="verifying")
    # verifying | verification_failed | awaiting_payment | payment_submitted |
    # paid | fulfilled | activation_failed | rejected | refunded_wallet
    payment_matched_at = db.Column(db.DateTime, nullable=True)
    fulfilled_at = db.Column(db.DateTime, nullable=True)
    renewal_at = db.Column(db.DateTime, nullable=True)
    reminder_sent = db.Column(db.Boolean, default=False)
    notes = db.Column(db.Text, default="")

    created_at = db.Column(db.DateTime, default=utcnow)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)

    package = db.relationship("Package", back_populates="orders")
    reseller = db.relationship("Reseller", back_populates="orders")
    customer_wallet = db.relationship("CustomerWallet", back_populates="orders")
    cash_wallet = db.relationship("CashWallet", back_populates="orders")
    payment_events = db.relationship(
        "PaymentEvent", back_populates="order", lazy="dynamic"
    )

    @property
    def national_id(self) -> str:
        return decrypt_text(self._national_id)

    @national_id.setter
    def national_id(self, value: str) -> None:
        self._national_id = encrypt_text(value) if value else ""

    @property
    def account_password(self) -> str:
        return decrypt_text(self._account_password)

    @account_password.setter
    def account_password(self, value: str) -> None:
        self._account_password = encrypt_text(value) if value else ""

    @property
    def national_id_masked(self) -> str:
        nid = self.national_id
        if len(nid) < 6:
            return "••••" if nid else ""
        return nid[:3] + "••••••" + nid[-3:]


class PaymentEvent(db.Model):
    __tablename__ = "payment_events"

    id = db.Column(db.Integer, primary_key=True)
    raw_message = db.Column(db.Text, nullable=False)
    sender_number = db.Column(db.String(20), default="")
    amount = db.Column(db.Float, nullable=True)
    provider = db.Column(db.String(40), default="unknown")
    transaction_ref = db.Column(db.String(80), default="")
    matched = db.Column(db.Boolean, default=False)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow)

    order = db.relationship("Order", back_populates="payment_events")
