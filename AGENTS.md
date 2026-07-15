# AGENTS.md

## Cursor Cloud specific instructions

This repo is a monorepo with **two independent products** (no service-to-service communication):

| Product | Path | Stack | DB | Dev port |
|---|---|---|---|---|
| A. Mobile Line Manager (dashboard) | repo root | Next.js 16 + Prisma (pnpm) | PostgreSQL | 3000 |
| B. Vodafone Red Store | `vodafone_app/` | Flask 3 (pip venv) | SQLite (file) | 5000 |

Standard commands live in `package.json` scripts (A) and `vodafone_app/README.md` (B). Notes below are only the non-obvious caveats.

### Product A — Next.js (repo root)
- Requires a running **PostgreSQL**. It is installed in the VM snapshot but the service is **not auto-started on boot** — start it each session: `sudo pg_ctlcluster 16 main start`.
- Connection is `postgresql://postgres:postgres@localhost:5432/5gstore` (see `.env`, DB + `postgres` password already provisioned in the snapshot). The `5gstore` database, migrations, and seed data persist in the snapshot.
- Run dev server: `pnpm dev` (http://localhost:3000). Lint: `pnpm lint`. Migrations: `npx prisma migrate deploy`.
- **Gotcha:** `pnpm build` and `pnpm seed` run `node prisma/seed.js`, which does **not** auto-load `.env`. Run seed as `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/5gstore" pnpm seed`. (`npx prisma` commands do load `.env` automatically.)
- **Gotcha:** `pnpm build` script is `prisma migrate dev; pnpm seed; next build` — it needs Postgres up first.
- Admin login (from seed): username `admin`, password `password` → redirects to `/companies`.
- `pnpm lint` currently reports pre-existing errors/warnings in the repo source (e.g. `no-explicit-any`); the linter is configured correctly — these are not environment problems.
- `install_prisma.sh` is stale (hardcoded `/home/ubuntu/nextjs_project`, uses npm) — ignore it; use pnpm.

### Product B — Flask (`vodafone_app/`)
- Uses a virtualenv at `vodafone_app/.venv`. Run: `cd vodafone_app && .venv/bin/python run.py` (http://127.0.0.1:5000).
- Requires `vodafone_app/.env` (copy from `vodafone_app/.env.example`); it selects SQLite via `DATABASE_URL=sqlite:///vodafone_store.db`. The SQLite DB and admin/packages auto-seed on first run.
- **Important gotcha:** `config.py` calls `load_dotenv(..., override=False)`, so a globally exported `DATABASE_URL` (e.g. Product A's PostgreSQL URL) would override `vodafone_app/.env` and crash Flask with `ModuleNotFoundError: No module named 'psycopg2'`. Do **not** export `DATABASE_URL` in the shell that runs Flask — rely on its `.env` file.
- Admin panel: `/admin/login`, username `admin`, password `admin123`.
- Payment webhook (simulates the mobile SMS forwarder): `POST /api/payment/webhook` with header `X-Webhook-Token: mobile-app-secret-token`. An order marked `payment_submitted` with a matching `sender_number`/`amount` auto-transitions to `paid`.
- No automated test suite or linter is configured for this product.
