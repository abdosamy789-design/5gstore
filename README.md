# nextjs_project + Vodafone Red Store

هذا الريبو يحتوي على:

- مشروع Next.js الأصلي (لوحة إدارة خطوط)
- تطبيق بايثون جديد لبيع باقات فودافون ريد مع بوابة دفع: انظر [`vodafone_app/README.md`](vodafone_app/README.md)

## تشغيل متجر فودافون ريد (Python)

```bash
cd vodafone_app
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python run.py
```

افتح http://127.0.0.1:5000 — دخول المدير: `admin` / `admin123`
