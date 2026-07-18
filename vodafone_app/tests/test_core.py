"""Core unit tests (no Redis required — Celery runs eager)."""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

_TMP = tempfile.TemporaryDirectory()
_DB = Path(_TMP.name) / "test.db"
os.environ["VODAFONE_VERIFY_MODE"] = "mock"
os.environ["SECRET_KEY"] = "test-secret-key"
os.environ["ADMIN_PASSWORD"] = "Admin@Test123!"
os.environ["ADMIN_USERNAME"] = "admin"
os.environ["PAYMENT_WEBHOOK_TOKEN"] = "test-webhook-token"
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"
os.environ["CELERY_TASK_ALWAYS_EAGER"] = "1"
os.environ["CELERY_EAGER"] = "1"
os.environ["OTP_DEBUG_ECHO"] = "1"


class CryptoTests(unittest.TestCase):
    def test_roundtrip(self):
        from services.crypto import decrypt_text, encrypt_text

        token = encrypt_text("29501011234567")
        self.assertNotEqual(token, "29501011234567")
        self.assertEqual(decrypt_text(token), "29501011234567")


class ValidatorTests(unittest.TestCase):
    def test_vodafone_prefix(self):
        from services.vodafone_validator import validate_vodafone_customer

        ok, _, norm = validate_vodafone_customer("01012345678")
        self.assertTrue(ok)
        self.assertEqual(norm, "01012345678")

        ok2, _, _ = validate_vodafone_customer("01112345678")
        self.assertFalse(ok2)

    def test_mock_verify(self):
        from services.vodafone_validator import verify_vodafone_account

        result = verify_vodafone_account(
            "01012345678", password="pass1234", national_id="29501011234567"
        )
        self.assertTrue(result["ok"])


class SmsParserTests(unittest.TestCase):
    def test_parse_vodafone_cash(self):
        from services.payment_gateway import detect_provider, parse_payment_sms

        sender, amount, txn = parse_payment_sms(
            "تم استلام 150 EGP من الرقم 01099887766 رقم العملية TXN112233"
        )
        self.assertEqual(sender, "01099887766")
        self.assertEqual(amount, 150.0)
        self.assertEqual(txn, "TXN112233")
        self.assertEqual(
            detect_provider("تم التحويل عبر إنستاباي بمبلغ 50 جنيه"), "instapay"
        )


class AppFlowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from app import create_app

        cls.app = create_app()
        cls.client = cls.app.test_client()

    def test_home(self):
        res = self.client.get("/")
        self.assertEqual(res.status_code, 200)
        self.assertIn("فودافون ريد".encode("utf-8"), res.data)

    def test_create_order_async_verify_and_match_payment(self):
        from models import CashWallet, Order, Package

        with self.app.app_context():
            pkg = Package.query.filter_by(is_active=True).first()
            self.assertIsNotNone(pkg)
            package_id = pkg.id
            amount = pkg.price
            self.assertTrue(CashWallet.query.count() >= 1)

        res = self.client.post(
            "/order",
            data={
                "customer_name": "أحمد محمد علي",
                "vodafone_number": "01012345678",
                "whatsapp_number": "01012345678",
                "national_id": "29501011234567",
                "account_password": "mypass12",
                "package_id": package_id,
            },
            follow_redirects=False,
        )
        self.assertEqual(res.status_code, 302)
        location = res.headers["Location"]
        self.assertIn("/pay/", location)
        reference = location.rstrip("/").split("/")[-1]

        with self.app.app_context():
            order = Order.query.filter_by(reference=reference).first()
            self.assertTrue(order.account_verified)
            self.assertEqual(order.status, "awaiting_payment")
            self.assertTrue(order.pay_to_number)

        res2 = self.client.post(
            f"/pay/{reference}",
            data={"sender_number": "01099887766", "action": "cash"},
            follow_redirects=False,
        )
        self.assertEqual(res2.status_code, 302)

        sms = f"تم استلام {int(amount)} EGP من الرقم 01099887766 عبر فودافون كاش"
        res3 = self.client.post(
            "/api/payment/webhook",
            json={
                "message": sms,
                "sender": "01099887766",
                "amount": amount,
                "provider": "vodafone_cash",
            },
            headers={"X-Webhook-Token": "test-webhook-token"},
        )
        self.assertEqual(res3.status_code, 200)
        payload = res3.get_json()
        self.assertTrue(payload["matched"])

        with self.app.app_context():
            order = Order.query.filter_by(reference=reference).first()
            self.assertEqual(order.status, "paid")
            self.assertNotEqual(order._national_id, "29501011234567")

    def test_activation_failed_refunds_wallet_and_retry(self):
        from models import CustomerWallet, Order, Package
        from services.tasks import mark_activation_failed

        with self.app.app_context():
            pkg = Package.query.filter_by(is_active=True).first()

        res = self.client.post(
            "/order",
            data={
                "customer_name": "سارة علي",
                "vodafone_number": "01022223333",
                "whatsapp_number": "01022223333",
                "national_id": "29501011234567",
                "account_password": "pass9999",
                "package_id": pkg.id if hasattr(pkg, "id") else None,
            },
            follow_redirects=False,
        )
        # re-fetch package id safely
        with self.app.app_context():
            package_id = Package.query.filter_by(is_active=True).first().id

        if res.status_code != 302:
            res = self.client.post(
                "/order",
                data={
                    "customer_name": "سارة علي",
                    "vodafone_number": "01022223333",
                    "whatsapp_number": "01022223333",
                    "national_id": "29501011234567",
                    "account_password": "pass9999",
                    "package_id": package_id,
                },
                follow_redirects=False,
            )
        self.assertEqual(res.status_code, 302)
        reference = res.headers["Location"].rstrip("/").split("/")[-1]

        with self.app.app_context():
            order = Order.query.filter_by(reference=reference).first()
            order.status = "paid"
            amount = order.amount
            order_id = order.id
            from models import db

            db.session.commit()

            result = mark_activation_failed(order_id, "خط غير مؤهل")
            self.assertTrue(result["ok"])
            order = Order.query.get(order_id)
            self.assertEqual(order.status, "refunded_wallet")
            wallet = CustomerWallet.query.filter_by(phone="01022223333").first()
            self.assertIsNotNone(wallet)
            self.assertAlmostEqual(wallet.balance, amount)

        # Retry with another number using wallet
        res_retry = self.client.post(
            f"/retry/{reference}",
            data={
                "vodafone_number": "01044445555",
                "package_id": package_id,
            },
            follow_redirects=False,
        )
        self.assertEqual(res_retry.status_code, 302)
        new_ref = res_retry.headers["Location"].rstrip("/").split("/")[-1]
        with self.app.app_context():
            new_order = Order.query.filter_by(reference=new_ref).first()
            self.assertEqual(new_order.status, "paid")
            self.assertTrue(new_order.paid_from_wallet)
            self.assertEqual(new_order.vodafone_number, "01044445555")
            wallet = CustomerWallet.query.filter_by(phone="01022223333").first()
            self.assertAlmostEqual(wallet.balance, 0.0)

    def test_reseller_prepaid_order(self):
        from models import Order, Package, Reseller, db
        from services.reseller_billing import credit_reseller

        with self.app.app_context():
            reseller = Reseller(
                username="dealer1",
                company_name="Dealer Co",
                phone="01011112222",
                balance=0,
                is_active=True,
            )
            reseller.set_password("dealerpass")
            db.session.add(reseller)
            db.session.commit()
            credit_reseller(reseller, 500, reason="test_topup")
            pkg = Package.query.filter_by(is_active=True).first()
            wholesale = pkg.price_for(reseller)

        login = self.client.post(
            "/reseller/login",
            data={"username": "dealer1", "password": "dealerpass"},
            follow_redirects=False,
        )
        self.assertEqual(login.status_code, 302)

        res = self.client.post(
            "/reseller/order",
            data={
                "customer_name": "عميل جملة",
                "vodafone_number": "01066667777",
                "whatsapp_number": "01066667777",
                "national_id": "29501011234567",
                "account_password": "abc12345",
                "package_id": pkg.id,
            },
            follow_redirects=False,
        )
        self.assertEqual(res.status_code, 302)

        with self.app.app_context():
            order = (
                Order.query.filter_by(vodafone_number="01066667777")
                .order_by(Order.id.desc())
                .first()
            )
            self.assertIsNotNone(order)
            self.assertEqual(order.status, "paid")
            self.assertAlmostEqual(order.amount, wholesale)
            reseller = Reseller.query.filter_by(username="dealer1").first()
            self.assertAlmostEqual(reseller.balance, 500 - wholesale)

    def test_wallet_rotation_picks_under_limit(self):
        from models import CashWallet, db
        from services.wallet_rotation import assign_receiving_wallet

        with self.app.app_context():
            CashWallet.query.delete()
            db.session.commit()
            w1 = CashWallet(
                label="A",
                number="01010000001",
                daily_limit=100,
                monthly_limit=1000,
                received_today=95,
                received_month=95,
                priority=1,
                is_active=True,
                last_reset_day=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                last_reset_month=datetime.now(timezone.utc).strftime("%Y-%m"),
            )
            w2 = CashWallet(
                label="B",
                number="01010000002",
                daily_limit=500,
                monthly_limit=5000,
                received_today=0,
                received_month=0,
                priority=2,
                is_active=True,
                last_reset_day=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                last_reset_month=datetime.now(timezone.utc).strftime("%Y-%m"),
            )
            db.session.add_all([w1, w2])
            db.session.commit()
            chosen = assign_receiving_wallet(50)
            self.assertEqual(chosen.number, "01010000002")

    def test_renewal_reminder_task(self):
        from models import Order, Package, db
        from services.tasks import send_renewal_reminders

        with self.app.app_context():
            pkg = Package.query.filter_by(is_active=True).first()
            order = Order(
                reference="VR-REMIND01",
                customer_name="تجديد",
                vodafone_number="01088889999",
                whatsapp_number="01088889999",
                package_id=pkg.id,
                amount=pkg.price,
                pay_to_number="01000000000",
                status="fulfilled",
                fulfilled_at=datetime.now(timezone.utc) - timedelta(days=27),
                renewal_at=datetime.now(timezone.utc) + timedelta(days=3),
                reminder_sent=False,
            )
            db.session.add(order)
            db.session.commit()
            result = send_renewal_reminders()
            self.assertTrue(result["ok"])
            self.assertGreaterEqual(result["candidates"], 1)
            order = Order.query.filter_by(reference="VR-REMIND01").first()
            self.assertTrue(order.reminder_sent)

    def test_otp_rejects_wrong_code_and_accepts_correct_code(self):
        from services.otp import confirm_otp, request_otp, validate_verification_token

        with self.app.app_context():
            number = "01033334444"
            result = request_otp(number)
            self.assertTrue(result["ok"])
            self.assertIn("debug_code", result)
            code = result["debug_code"]

            wrong_code = "000000" if code != "000000" else "111111"
            wrong = confirm_otp(number, wrong_code)
            self.assertFalse(wrong["ok"])

            right = confirm_otp(number, code)
            self.assertTrue(right["ok"])
            token = right["token"]
            self.assertTrue(validate_verification_token(number, token))
            self.assertFalse(validate_verification_token(number, "garbage-token"))
            self.assertFalse(validate_verification_token("01099998888", token))

            # Code is single-use: re-confirming the same challenge fails
            reused = confirm_otp(number, code)
            self.assertFalse(reused["ok"])

    def test_verify_vodafone_account_otp_mode_is_strict(self):
        from services.otp import confirm_otp, request_otp
        from services.vodafone_validator import verify_vodafone_account

        with self.app.app_context():
            number = "01055556666"

            no_token = verify_vodafone_account(number, mode_override="otp")
            self.assertFalse(no_token["ok"])

            bogus_token = verify_vodafone_account(
                number, otp_token="not-a-real-token", mode_override="otp"
            )
            self.assertFalse(bogus_token["ok"])

            req = request_otp(number)
            conf = confirm_otp(number, req["debug_code"])
            self.assertTrue(conf["ok"])

            accepted = verify_vodafone_account(
                number, otp_token=conf["token"], mode_override="otp"
            )
            self.assertTrue(accepted["ok"])
            self.assertEqual(accepted["mode"], "otp")

    def test_order_registration_rejected_then_accepted_via_otp(self):
        """End-to-end: force global mode to otp and confirm strict reject/accept."""
        from models import Order, Package

        old_mode = os.environ.get("VODAFONE_VERIFY_MODE")
        os.environ["VODAFONE_VERIFY_MODE"] = "otp"
        number = "01077778888"
        try:
            with self.app.app_context():
                package_id = Package.query.filter_by(is_active=True).first().id

            # Without an OTP token, registration is rejected outright — no
            # order row is ever created.
            res = self.client.post(
                "/order",
                data={
                    "customer_name": "محمد إبراهيم",
                    "vodafone_number": number,
                    "whatsapp_number": number,
                    "package_id": package_id,
                },
                follow_redirects=False,
            )
            self.assertEqual(res.status_code, 200)
            self.assertIn("لم يتم تأكيد".encode("utf-8"), res.data)
            with self.app.app_context():
                self.assertIsNone(Order.query.filter_by(vodafone_number=number).first())

            # Request one OTP, then exercise both the wrong-code rejection and
            # the correct-code acceptance against that same challenge.
            request_res = self.client.post("/api/otp/request", json={"number": number})
            code = request_res.get_json()["debug_code"]

            wrong_verify = self.client.post(
                "/api/otp/verify", json={"number": number, "code": "000000"}
            )
            self.assertFalse(wrong_verify.get_json()["ok"])

            right_verify = self.client.post(
                "/api/otp/verify", json={"number": number, "code": code}
            )
            payload = right_verify.get_json()
            self.assertTrue(payload["ok"])
            token = payload["token"]

            res2 = self.client.post(
                "/order",
                data={
                    "customer_name": "محمد إبراهيم",
                    "vodafone_number": number,
                    "whatsapp_number": number,
                    "package_id": package_id,
                    "otp_token": token,
                },
                follow_redirects=False,
            )
            self.assertEqual(res2.status_code, 302)
            with self.app.app_context():
                order = Order.query.filter_by(vodafone_number=number).first()
                self.assertIsNotNone(order)
                self.assertTrue(order.account_verified)
                self.assertEqual(order.verification_mode, "otp")
                self.assertEqual(order.status, "awaiting_payment")
        finally:
            if old_mode is not None:
                os.environ["VODAFONE_VERIFY_MODE"] = old_mode
            else:
                os.environ.pop("VODAFONE_VERIFY_MODE", None)

    def test_admin_login_and_export(self):
        res = self.client.post(
            "/admin/login",
            data={"username": "admin", "password": "Admin@Test123!"},
            follow_redirects=False,
        )
        self.assertEqual(res.status_code, 302)
        res2 = self.client.get("/admin/orders/export")
        self.assertEqual(res2.status_code, 200)
        self.assertIn("text/csv", res2.content_type)


if __name__ == "__main__":
    try:
        unittest.main()
    finally:
        _TMP.cleanup()
