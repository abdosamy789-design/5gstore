# فودافون ريد — منصة التسجيل والتفعيل

تطبيق Flask لبيع وتفعيل باقات فودافون ريد مصر مع:

1. **بوابة دفع P2P SMS** — استقبال رسائل الكاش وإنستاباي من تطبيق أندرويد ومطابقة (رقم المحول + المبلغ) تلقائياً
2. **تحقق حساب فودافون** — تحقق من بيانات الحساب قبل الدفع (وضع mock / prefix / Playwright live)
3. **لوحة مدير** — طلبات، حالات دفع، تعديل أسعار، تصدير CSV
4. **تنبيهات** — تليجرام للمدير وواتساب للعميل
5. **تشفير** — الرقم القومي وكلمة مرور الحساب مشفّران بـ Fernet

## التشغيل

```bash
cd vodafone_app
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# للتحقق الحي فقط:
# playwright install chromium
python run.py
```

- الموقع: http://127.0.0.1:5000
- المدير: http://127.0.0.1:5000/admin/login  
  الافتراضي: `admin` / `Admin@Red2026!` — غيّره فوراً من الإعدادات أو `.env`

## إعدادات مهمة (`.env`)

| المتغير | الوصف |
|---------|--------|
| `SECRET_KEY` | مفتاح جلسات Flask |
| `ENCRYPTION_KEY` | مفتاح Fernet (أو يُشتق من SECRET_KEY) |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | دخول المدير |
| `PAYMENT_WEBHOOK_TOKEN` | توكن تطبيق الأندرويد |
| `VODAFONE_CASH_NUMBER` | رقم استلام فودافون كاش |
| `INSTAPAY_ADDRESS` | عنوان إنستاباي |
| `VODAFONE_VERIFY_MODE` | `mock` أو `prefix` أو `live` |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | تنبيهات المدير |
| `WHATSAPP_*` | تنبيهات العميل (callmebot / ultramsg / webhook) |

يمكن أيضاً ضبط معظم القيم من **لوحة المدير → الإعدادات**.

## ربط تطبيق الأندرويد (P2P SMS)

التطبيق يقرأ SMS من فودافون كاش / إنستاباي / محافظ أخرى ويرسل:

```http
POST /api/payment/webhook
X-Webhook-Token: <التوكن>
Content-Type: application/json

{
  "message": "تم استلام 100 EGP من الرقم 01012345678 رقم العملية TXN998877",
  "sender": "01012345678",
  "amount": 100,
  "provider": "vodafone_cash",
  "transaction_ref": "TXN998877",
  "sender_app": "Vodafone Cash"
}
```

المزوّدات المدعومة في الـ parser: `vodafone_cash`, `instapay`, `orange_cash`, `etisalat_cash`, `we_pay`.

عند تطابق رقم المحول والمبلغ مع طلب معلّق تتحول الحالة إلى **مدفوع** ويُرسل إشعار.

## التحقق من حساب فودافون

- `prefix`: التحقق من نطاق 010 فقط
- `mock` (افتراضي): تحقق الشكل + الرقم القومي + كلمة المرور — مناسب للتطوير والاختبار
- `live`: Playwright يفتح بوابة فودافون ويحاول التحقق (يتطلب `playwright install chromium`)

## الأمان

- كلمات مرور المدير مخزّنة بـ Werkzeug hash
- الرقم القومي وكلمة مرور الحساب مشفّران في قاعدة البيانات
- الرقم القومي يظهر مقنّعاً في لوحة المدير
- توكن الـ webhook يُقارن بـ `secrets.compare_digest`

## الاختبار السريع

```bash
python tests/test_core.py
```
