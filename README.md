# Stears URL shortener (Next.js, single app)

**Live:** [https://shorten.abubakar.life](https://shorten.abubakar.life)

One Next.js process serves the UI, JSON API, and `GET /s/:code` redirects. Data lives in **PostgreSQL** via `pg` (no separate API server).

**Prerequisites:** Node **20+** (`package.json` → `engines`), Docker + Compose if you use the supplied stack.

## Run it

```bash
cp .env.example .env
# Set ADMIN_TOKEN, POSTGRES_*, PUBLIC_BASE_URL, etc. (see table below).
```

**Docker (Postgres only on the internal network):**

```bash
docker compose up --build
```

**Docker with hot reload** (same `Dockerfile`, `dev-runtime` stage; bind-mounts the repo so edits refresh without rebuilding the app image). Stop the production `web` container first if it is already using `PORT`:

```bash
npm run docker:dev
```

**Node on the host:** Postgres must match `DATABASE_URL` in `.env`, then:

```bash
npm install
npm run dev
```

Open `PUBLIC_BASE_URL` (e.g. [http://localhost:4405](http://localhost:4405)); admin UI at `/admin`.

**Production-shaped local run:**

```bash
npm run build && npm start
```

**DB shell (from project dir, with `.env` loaded or literals substituted):**

```bash
docker compose exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

Compose fails fast if `${VAR:?…}` interpolation vars are missing. Remove any legacy `DATABASE_PATH` (SQLite-era).

## Project layout

```
src/
  app/           # pages, API routes, redirect /s/[code]
  components/    # shorten-form, admin-dashboard
  lib/           # env, constants, db, url, rate-limit, admin
```

## Environment variables

`dotenv` loads `.env` on the server (`src/lib/env.ts`). Commit **`.env.example` only**.

| Variable | Purpose |
| --- | --- |
| `PORT` | **Required.** HTTP port; in Compose, host publish and container listen should match. |
| `DATABASE_URL` | **Required on the host** for `npm run dev` / `start`. Omitted for compose-only runs — `web` gets `DATABASE_URL` from `docker-compose.yml`. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | **Required** for Compose and DB URL interpolation. |
| `PUBLIC_BASE_URL` | Public origin for short URLs in API responses (no trailing slash). |
| `ADMIN_TOKEN` | Secret for `/api/admin/*`; send `Authorization: Bearer <token>` or `X-Admin-Token`. |
| `TRUST_PROXY` | `0` or `1`. Use `1` only behind a **trusted** reverse proxy so `X-Forwarded-For` is meaningful. |
| `BLOCK_INTERNAL_URLS` | `0` or `1` — reject obvious private/loopback hostnames when shortening. |

The UI calls **same-origin** `/api/*`; no separate frontend base URL is needed.

## Rate limits & size caps (code defaults)

Tuned in [`src/lib/constants.ts`](src/lib/constants.ts) (not env): **one** window (**15 min**) and **300 requests / IP / window**, with **separate counters** per route kind (`shorten`, `stats`, `redirect`, `admin`). `GET /api/health` is unlimited.

Also: max URL length **2048**, max `Content-Length` for shorten **32 KiB**. Enforcement is in-memory per process ([`src/lib/rate-limit.ts`](src/lib/rate-limit.ts)); multiple replicas would need a shared store (e.g. Redis).

## API

**Public**

- `POST /api/shorten` — `{ "url": "..." }` → `{ code, shortUrl, longUrl, clickCount, createdAt, isDuplicate }`.
- `GET /s/:code` — `302`; unknown → `404` JSON.
- `GET /api/stats/:code` — `code`, `clickCount`, `createdAt` (no IPs).
- `GET /api/health` — `{ ok: true }`.

**Admin** (Bearer or `X-Admin-Token`)

- `GET /api/admin/links` — `?limit=&offset=`
- `GET /api/admin/clicks` — `?limit=`
- `GET /api/admin/summary` — `{ linkCount, clickCount }`

Missing/invalid admin token → **401**. Admin auth is **demo-grade** (plain token compare); not side-channel hardened.

## Design notes (assessment / trade-offs)

- **URLs:** `http`/`https` only, length and control-char checks, optional internal-host block; redirects re-validate stored targets (`410` if unsafe).
- **Duplicates:** Normalized long URL is unique; API returns `isDuplicate`.
- **Concurrency:** Slug collisions retried; redirect + click count in one transaction.
- **SQL:** Parameterized queries only.
- **Headers:** `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `poweredByHeader: false` in `next.config.ts`.
- **No ORM / migration tool** — `CREATE TABLE IF NOT EXISTS` on first use; fine for this scope.
- **Postgres not published** from Compose by default; optional `internal: true` on the app network limits container egress (remove if you need outbound HTTP from the app).
- **Admin token in `sessionStorage`** — demo only.
- **IPs in `click_events`** — useful for abuse; mind privacy policy / retention.

## Edge cases

| Case | Behavior |
| --- | --- |
| Invalid URL / bad JSON | `400` |
| Non-http(s) | `400` |
| Duplicate long URL | Same row; `isDuplicate: true` |
| Rate limit | `429` + `Retry-After`, `RateLimit-*` |
| Unknown code | `404` on redirect |
| Oversized body / URL | `413` / `400` |
| Unsafe stored redirect | `410`, no click recorded |

## Git

```bash
git init
git add .
git commit -m "Initial commit: Next.js URL shortener"
git remote add origin <your-gitlab-url>
git push -u origin main
```

`.gitignore` excludes `node_modules`, `.next`, `.env`, and legacy `*.db` / `/data/`.
