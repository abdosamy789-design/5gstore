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
    data_gb = db.Column(db.Float, default=0)
    minutes = db.Column(db.Integer, default=0)
    validity_days = db.Column(db.Integer, default=30)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=utcnow)

    orders = db.relationship("Order", back_populates="package")


class Order(db.Model):
    __tablename__ = "orders"

    id = db.Column(db.Integer, primary_key=True)
    reference = db.Column(db.String(32), unique=True, nullable=False)

    customer_name = db.Column(db.String(120), nullable=False)
    vodafone_number = db.Column(db.String(20), nullable=False)
    whatsapp_number = db.Column(db.String(20), default="")

    # Encrypted at rest
    _national_id = db.Column("national_id", db.Text, default="")
    _account_password = db.Column("account_password", db.Text, default="")

    account_verified = db.Column(db.Boolean, default=False)
    verification_mode = db.Column(db.String(20), default="")
    verification_message = db.Column(db.Text, default="")

    package_id = db.Column(db.Integer, db.ForeignKey("packages.id"), nullable=False)
    amount = db.Column(db.Float, nullable=False)

    pay_to_number = db.Column(db.String(20), nullable=False)
    instapay_address = db.Column(db.String(120), default="")
    sender_number = db.Column(db.String(20), default="")

    status = db.Column(
        db.String(30), default="awaiting_payment"
    )  # awaiting_payment | payment_submitted | paid | fulfilled | rejected
    payment_matched_at = db.Column(db.DateTime, nullable=True)
    notes = db.Column(db.Text, default="")

    created_at = db.Column(db.DateTime, default=utcnow)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)

    package = db.relationship("Package", back_populates="orders")
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
    """Incoming SMS / webhook notifications from the Android P2P reader."""

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
