# AGENTS.md

## Cursor Cloud specific instructions

This repo is a monorepo with **two independent products** (no shared runtime):

| Product | Path | Stack | Dev command | Port |
|---|---|---|---|---|
| Mobile Line Manager (admin dashboard) | repo root | Next.js 16 + Prisma + PostgreSQL | `pnpm dev` | 3000 |
| Vodafone Red Store | `vodafone_app/` | Flask + SQLAlchemy (SQLite) | `.venv/bin/python run.py` | 5000 |

Standard scripts live in `package.json` (`dev`/`build`/`start`/`lint`/`seed`) and `vodafone_app/README.md` — refer to those rather than duplicating.

### PostgreSQL (Next.js app) — required, not auto-started
- PostgreSQL 16 is installed in the snapshot but the service does **not** start on boot. Start it each session with: `sudo pg_ctlcluster 16 main start`.
- Connection (matches root `.env` / `.env.example`): `postgresql://postgres:postgres@localhost:5432/5gstore` (user `postgres`, password `postgres`, db `5gstore`). The `postgres` role password is set to `postgres`.
- The `5gstore` DB is already migrated and seeded in the snapshot. If it is ever missing, recreate with: `sudo -u postgres createdb 5gstore` then `pnpm exec prisma migrate deploy` and `pnpm seed`.
- Seeded admin login for the dashboard: `admin` / `password`.
- Root `.env` (gitignored) must contain `DATABASE_URL`. If missing, `cp .env.example .env`.

### Next.js app gotchas
- Use **pnpm** (declared `packageManager`), not npm, despite `package-lock.json` also being present.
- `prisma generate` runs automatically via the `@prisma/client` postinstall hook during `pnpm install`.
- The `build` script (`prisma migrate dev; pnpm seed; next build`) needs a running PostgreSQL even just to build.
- **Frontend write actions are intentionally stubbed**: `src/context/ApiAppContext.tsx` implements `addPlan`, `addNewCustomer`, etc. as no-op `unmigratedAction` placeholders, so creating entities from the UI does not persist (hence the "Database integration in progress" banner from `src/components/MainLayout.tsx`). The backend API routes under `src/app/api/*` DO persist to Postgres via Prisma, and the UI read/display path is fully wired. To exercise writes end-to-end, POST to the API routes directly.
- `pnpm lint` currently reports pre-existing errors/warnings in application code; these are not environment issues.
- `install_prisma.sh` hardcodes `/home/ubuntu/nextjs_project` — do not use it; run Prisma commands from the repo root instead.

### Vodafone Flask app gotchas
- Runs from a virtualenv at `vodafone_app/.venv`. Run via `cd vodafone_app && .venv/bin/python run.py` (or activate the venv first).
- Uses SQLite (`vodafone_app/vodafone_store.db`), auto-created on startup — no external DB service needed.
- `vodafone_app/.env` (gitignored) is required; if missing, `cp vodafone_app/.env.example vodafone_app/.env`.
- Admin panel login: `admin` / `Admin@Red2026!` at `/admin/login`.
- Default `VODAFONE_VERIFY_MODE=mock` makes ordering fully testable offline; Telegram/WhatsApp/Playwright-`live` integrations are optional and degrade gracefully. `live` mode needs `playwright install chromium`.
- Tests: `cd vodafone_app && .venv/bin/python tests/test_core.py`.
