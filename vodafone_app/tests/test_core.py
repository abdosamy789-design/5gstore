"""Core unit tests (no external network required)."""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# Configure before importing the app package
_TMP = tempfile.TemporaryDirectory()
_DB = Path(_TMP.name) / "test.db"
os.environ["VODAFONE_VERIFY_MODE"] = "mock"
os.environ["SECRET_KEY"] = "test-secret-key"
os.environ["ADMIN_PASSWORD"] = "Admin@Test123!"
os.environ["ADMIN_USERNAME"] = "admin"
os.environ["PAYMENT_WEBHOOK_TOKEN"] = "test-webhook-token"
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"


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

        bad = verify_vodafone_account(
            "01012345678", password="ab", national_id="29501011234567"
        )
        self.assertFalse(bad["ok"])


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

    def test_create_order_and_match_payment(self):
        from models import Order, Package

        with self.app.app_context():
            pkg = Package.query.filter_by(is_active=True).first()
            self.assertIsNotNone(pkg)
            package_id = pkg.id
            amount = pkg.price

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

        res2 = self.client.post(
            f"/pay/{reference}",
            data={"sender_number": "01099887766"},
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
        self.assertTrue(payload["ok"])
        self.assertTrue(payload["matched"])
        self.assertEqual(payload["order_reference"], reference)

        with self.app.app_context():
            order = Order.query.filter_by(reference=reference).first()
            self.assertEqual(order.status, "paid")
            self.assertTrue(order.account_verified)
            self.assertNotEqual(order._national_id, "29501011234567")
            self.assertEqual(order.national_id, "29501011234567")

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
