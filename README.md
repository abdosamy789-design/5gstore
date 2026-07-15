# nextjs_project + Vodafone Red Store

هذا الريبو يحتوي على:

- مشروع Next.js الأصلي (لوحة إدارة خطوط)
- تطبيق بايثون (Flask) لمنصة فودافون ريد مع Celery/Redis، موزعين، محفظة داخلية، تدوير محافظ، وتذكير تجديد — انظر [`vodafone_app/README.md`](vodafone_app/README.md)

## تشغيل متجر فودافون ريد (Python)

```bash
cd vodafone_app
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# للتطوير بدون Redis:
export CELERY_TASK_ALWAYS_EAGER=1
python run.py
```

افتح http://127.0.0.1:5000 — المدير: `admin` / `admin` — الموزع: `/reseller/login`
