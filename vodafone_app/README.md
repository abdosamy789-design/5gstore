# فودافون ريد — منصة التسجيل والتفعيل

تطبيق Flask لبيع وتفعيل باقات فودافون ريد مصر.

## المميزات

1. **بوابة دفع P2P SMS** — فودافون كاش / إنستاباي / محافظ أخرى عبر تطبيق أندرويد
2. **تحقق حساب فودافون** — في الخلفية عبر **Celery + Redis** (أو وضع eager للتطوير)
3. **لوحة مدير** — طلبات، أسعار، تصدير CSV، محافظ، موزعون
4. **تنبيهات** — تليجرام للمدير وواتساب للعميل
5. **تشفير** — الرقم القومي وكلمة مرور الحساب (Fernet)
6. **موزعون B2B** — رصيد مسبق + أسعار جملة (`/reseller/login`)
7. **محفظة داخلية** — رد تلقائي عند فشل التفعيل وإعادة المحاولة برقم آخر
8. **تدوير محافظ الكاش** — حدود يومية/شهرية واختيار تلقائي
9. **تذكير تجديد** — Celery Beat يرسل واتساب قبل التجديد بـ 3 أيام

## التشغيل

```bash
cd vodafone_app
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env

# Redis (للإنتاج)
# sudo apt install redis-server
# celery -A celery_app.celery_app worker -l info
# celery -A celery_app.celery_app beat -l info

# للتطوير بدون Redis:
# CELERY_TASK_ALWAYS_EAGER=1

python run.py
```

- الموقع: http://127.0.0.1:5000
- المدير: `/admin/login` — `admin` / `admin`
- الموزع: `/reseller/login`
- المحفظة: `/wallet`

## Celery

| مهمة | الوظيفة |
|------|---------|
| `services.tasks.verify_order_account` | تحقق حساب فودافون بعد إنشاء الطلب |
| `services.tasks.mark_activation_failed` | فشل تفعيل → شحن محفظة العميل |
| `services.tasks.send_renewal_reminders` | تذكير واتساب (جدولة يومية 10:00) |
| `services.tasks.reset_cash_wallet_counters` | تصفير عدّادات المحافظ |

## الاختبار

```bash
CELERY_TASK_ALWAYS_EAGER=1 python tests/test_core.py
```
