# AGENTS.md

## Cursor Cloud specific instructions

This repo is a **mixed monorepo with two independent apps** (they do not share data or call each other):

- **Next.js "Mobile Line Manager"** admin panel — repo root (`src/`, `prisma/`). TypeScript + Next.js 16 + Prisma + **PostgreSQL**. Dev server on port **3000**.
- **Flask "Vodafone Red Store"** — `vodafone_app/`. Python 3 + Flask + SQLAlchemy + **SQLite** (auto-created). Dev server on port **5000**. Python deps live in `vodafone_app/.venv`.

Dependencies (Node via `pnpm install`, Python via `vodafone_app/.venv`) are refreshed by the startup update script; the notes below cover only what the update script does NOT do.

### PostgreSQL (required for the Next.js app only)

PostgreSQL 16 is preinstalled in the image but is **not auto-started**. Each session, start it and ensure the DB exists:

```bash
sudo pg_ctlcluster 16 main start
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='5gstore'" | grep -q 1 \
  || sudo -u postgres createdb 5gstore
# postgres role password is 'postgres' (matches .env / .env.example)
```

`.env` files are gitignored. If missing, recreate from templates: `cp .env.example .env` (root) and `cp vodafone_app/.env.example vodafone_app/.env`. The root `.env` `DATABASE_URL` points at `postgresql://postgres:postgres@localhost:5432/5gstore`.

### Running the Next.js app (port 3000)

```bash
npx prisma migrate deploy      # apply migrations (needs Postgres running)
npx prisma db seed             # seed admin user + demo data
pnpm dev
```

- Login at `/login` with `admin` / `password` (seeded).
- **Gotcha:** seed the DB with `npx prisma db seed`, NOT `pnpm seed`. The bare `node prisma/seed.js` script does not load `.env`, so `pnpm seed` fails with "Environment variable not found: DATABASE_URL". Prisma's own commands load `.env` automatically.
- **Gotcha:** `pnpm build` runs `prisma migrate dev; pnpm seed; next build`, so it requires Postgres to be running to build at all.
- **Pre-existing app behavior (not an env issue):** some pages (e.g. `/customers`) fire a client-side fetch loop that can surface `net::ERR_INSUFFICIENT_RESOURCES` in the browser console; the server answers every request `200`. Auth state is in-memory only, so a full page refresh logs you back out.

### Running the Flask app (port 5000)

```bash
cd vodafone_app
./.venv/bin/python run.py
```

- SQLite DB + default data (admin, 3 packages, settings) are auto-created on first boot.
- Admin login at `/admin/login` with `admin` / `Admin@Red2026!`.
- Default `VODAFONE_VERIFY_MODE=mock` needs nothing external. `live` mode additionally requires `playwright install chromium`. Telegram/WhatsApp notifications are optional and no-op when unconfigured.

### Lint / test

- **Next.js lint:** `pnpm lint`. **Gotcha:** with the Python venv present, eslint also traverses `vodafone_app/.venv` (a large Playwright `.d.ts`), producing thousands of spurious errors. Scope it to real source with `npx eslint --ignore-pattern "vodafone_app/**"`. Even scoped, there are ~41 pre-existing lint errors in `src/` unrelated to setup.
- **Flask tests:** `cd vodafone_app && ./.venv/bin/python tests/test_core.py` (stdlib unittest, no network; uses mock verify mode + temp SQLite).
