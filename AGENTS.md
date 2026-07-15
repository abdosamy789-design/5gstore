# AGENTS.md

## Cursor Cloud specific instructions

This repository is a **monorepo with two independent products** (they do not talk to each other):

1. **`nextjs_project`** (repo root) — Arabic "Mobile Line Manager" admin dashboard. Next.js 16 (App Router) + Prisma + **PostgreSQL**. Package manager is **pnpm** (`packageManager` field pins the version).
2. **`vodafone_app/`** — Arabic "Vodafone Red" store. Python 3 / Flask + Flask-SQLAlchemy on **SQLite** (self-contained, DB auto-created on startup).

The update script already runs `pnpm install` (root) and creates `vodafone_app/.venv` + installs `requirements.txt`. Below are the non-obvious caveats for running/testing each service; standard commands live in `package.json`, `README.md`, and `vodafone_app/README.md`.

### nextjs_project (root)
- **PostgreSQL is a hard requirement** and is NOT started by the update script. Start it before running: `sudo pg_ctlcluster 16 main start`. The `postgres` role password is `postgres` and the DB is `5gstore` (matches `.env.example`).
- Create `.env` from `.env.example` (it is gitignored): `cp .env.example .env`. The Next.js server and Prisma CLI auto-load `.env`.
- Apply schema before first run: `pnpm prisma migrate deploy` then seed with `pnpm seed`.
  - **Gotcha:** `prisma/seed.js` is a plain Node script that does NOT auto-load `.env`. Run it with `DATABASE_URL` exported, e.g. `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/5gstore" pnpm seed`. (Running via `pnpm dev`/`next` is fine since Next.js loads `.env`.)
- Run dev server: `pnpm dev` → http://localhost:3000. Login is `admin` / `password` (from the seed).
- **Gotcha (known app limitation):** all write/mutation actions in the UI are stubbed no-ops in `src/context/ApiAppContext.tsx` (`unmigratedAction`), and the UI shows a "Database integration in progress" banner. Login and all reads (GET) are wired to the real DB-backed API routes under `src/app/api/*`, and those API routes DO persist (e.g. `POST /api/company` writes to Postgres). So end-to-end writes are only reachable via the API routes directly, not the current UI. This is pre-existing app state, not an environment problem.
- Lint: `pnpm lint`. Note the existing app code currently has pre-existing eslint errors; the linter itself works.

### vodafone_app
- Self-contained; no external DB service needed (SQLite file at `vodafone_app/instance/vodafone_store.db`, auto-created).
- Setup env: `cd vodafone_app && cp .env.example .env`.
- Run dev server: `vodafone_app/.venv/bin/python run.py` (from inside `vodafone_app/`) → http://127.0.0.1:5000. Admin panel at `/admin/login` with `admin` / `Admin@Red2026!`.
- Tests: `vodafone_app/.venv/bin/python tests/test_core.py`.
- Account verification defaults to `VODAFONE_VERIFY_MODE=mock` (CI-safe). `live` mode needs `playwright install chromium`; Telegram/WhatsApp notifications are skipped gracefully when unconfigured.
