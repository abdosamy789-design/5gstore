from datetime import datetime, timezone

from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import check_password_hash, generate_password_hash

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
    national_id = db.Column(db.String(20), default="")
    line_verified = db.Column(db.Boolean, default=False)

    package_id = db.Column(db.Integer, db.ForeignKey("packages.id"), nullable=False)
    amount = db.Column(db.Float, nullable=False)

    # Number shown to customer to transfer to (Vodafone Cash)
    pay_to_number = db.Column(db.String(20), nullable=False)
    # Number the customer claims they transferred from
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


class PaymentEvent(db.Model):
    """Incoming SMS / webhook notifications from the mobile payment app."""

    __tablename__ = "payment_events"

    id = db.Column(db.Integer, primary_key=True)
    raw_message = db.Column(db.Text, nullable=False)
    sender_number = db.Column(db.String(20), default="")
    amount = db.Column(db.Float, nullable=True)
    matched = db.Column(db.Boolean, default=False)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow)

    order = db.relationship("Order", back_populates="payment_events")


class LineChallenge(db.Model):
    """OTP challenge proving the customer controls a Vodafone Egypt line."""

    __tablename__ = "line_challenges"

    id = db.Column(db.Integer, primary_key=True)
    token = db.Column(db.String(48), unique=True, nullable=False, index=True)
    vodafone_number = db.Column(db.String(20), nullable=False, index=True)
    customer_name = db.Column(db.String(120), default="")
    otp_code = db.Column(db.String(10), nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    attempts = db.Column(db.Integer, default=0)
    verified = db.Column(db.Boolean, default=False)
    verified_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow)