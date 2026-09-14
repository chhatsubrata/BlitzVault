# Environments — dev / staging / prod

How BlitzVault's environment variables differ across environments. The backend
validates all of these at boot via Zod ([`backend/src/shared/config/env.ts`](../backend/src/shared/config/env.ts));
missing/invalid values crash the process on purpose. **No real secrets live in
this repo** — `*.env.example` hold placeholders, and real values come from each
app's `*.env.local` (local) or the deployment platform's secret store
(staging/prod).

## Backend env vars

| Var | dev | staging | prod | Notes |
|---|---|---|---|---|
| `NODE_ENV` | `development` | `staging` | `production` | Controls `synchronize` (only dev), log format |
| `PORT` | `5001` | `5001` | platform | Defaults to 5001 |
| `DB_HOST` / `DB_PORT` | `127.0.0.1` / `5434` | managed PG host | managed PG host | Compose PG locally |
| `DB_USERNAME` / `DB_PASSWORD` / `DB_DATABASE` | `postgres` / `postgres` / `blitz_vault` | from secret store | from secret store | Never commit prod creds |
| `CLERK_SECRET_KEY` | `sk_test_…` | `sk_test_…` | `sk_live_…` | Live keys only in prod |
| `CLERK_PUBLISHABLE_KEY` | `pk_test_…` | `pk_test_…` | `pk_live_…` | |
| `CLERK_JWT_ISSUER` | dev instance | staging instance | prod instance | `https://<instance>.clerk.accounts.dev` |
| `CLERK_JWT_AUDIENCE` | optional | optional | recommended | Tighter JWT checks |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000,3001` | staging web origin(s) | prod web origin(s) | Comma-separated |
| `REDIS_HOST` / `REDIS_PORT` | `127.0.0.1` / `6379` | managed Redis | managed Redis | Rate limit + BullMQ |
| `REDIS_PASSWORD` | empty | from secret store | from secret store | |
| `DOCS_ENABLED` | `true` | `true` | **`false`** | Swagger at `/api/docs`; keep off in prod |
| `RATE_LIMIT_ENABLED` | `true` | `true` | `true` | Set `false` only in CI tests (no Redis) |
| `STORAGE_DRIVER` | `cloudinary` | `cloudinary` | `cloudinary` | `s3`/`r2` reserved (not implemented) |
| `CLOUDINARY_CLOUD_NAME` | from console | from console | from console | Cloudinary product environment |
| `CLOUDINARY_API_KEY` | from console | secret store | secret store | |
| `CLOUDINARY_API_SECRET` | from console | secret store | secret store | Never commit; `.env.local`/secret store only |
| `MAX_FILE_SIZE_BYTES` | `5368709120` | `5368709120` | `5368709120` | Upload cap (5 GiB) enforced at `/files/upload/init` |
| `UPLOAD_IDEMPOTENCY_TTL_SECONDS` | `86400` | `86400` | `86400` | TTL for cached `/upload/init` responses keyed by `Idempotency-Key` |
| `CLAMAV_ENABLED` | `false` | `false` | **`true`** (recommended) | Off → AV scan **stub** marks files clean; on → worker streams to clamd |
| `CLAMAV_HOST` / `CLAMAV_PORT` | `127.0.0.1` / `3310` | clamd host / `3310` | clamd host / `3310` | Compose `clamav` service locally |
| `CLAMAV_TIMEOUT_MS` | `15000` | `15000` | `15000` | Per-scan socket timeout |
| `FGA_ENABLED` | `false` → `true` after `fga:init` | `true` | `true` | Off → every `check` denies; app still boots |
| `FGA_API_URL` | `http://localhost:8080` | managed OpenFGA | managed OpenFGA | Compose `openfga` service locally |
| `FGA_STORE_ID` | from `pnpm fga:init` | secret store | secret store | One store per environment |
| `FGA_MODEL_ID` | from `pnpm fga:init` | secret store | secret store | **Pinned at boot.** Every model write mints a new id → redeploy after `fga:init` |

## Frontend env vars

| Var | Notes |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Public; `pk_test_…` non-prod, `pk_live_…` prod |
| `CLERK_SECRET_KEY` | Server-side only |
| `NEXT_PUBLIC_BACKEND_URL` | `http://localhost:5001` dev; staging/prod API origin |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `_SIGN_UP_URL` / `_AFTER_*` | Clerk redirect routes |
| `NEXT_PUBLIC_SHARING_MOCK` | **Dev only, temporary (Week 3).** `true` serves share fixtures from `features/sharing/mock/` while the backend share endpoints are unbuilt. Inert in a production build. Remove with the mock directory once the endpoints land |

## Storage notes

- **Cloudinary** is the active driver (`STORAGE_DRIVER=cloudinary`). Adapter lives in
  [`backend/src/shared/services/storage/`](../backend/src/shared/services/storage); the
  factory selects by `STORAGE_DRIVER`.
- `s3`/`r2` drivers and a local **MinIO** dev service are **deferred** until an
  S3-compatible driver is actually needed ("based on usage"). The `STORAGE_*`
  vars in `backend/.env.example` are commented placeholders for that future.
- Cloudinary creds (`CLOUDINARY_*`) come from the Cloudinary console; keep them in
  `*.env.local` (local) or the platform secret store (staging/prod) — never committed.

## AV scan (ClamAV)

- Uploaded files are scanned by a **BullMQ worker** (the `scan` queue). With
  `CLAMAV_ENABLED=false` (the default, and what CI uses) the scanner takes the
  **stub** path — every file is treated as clean, no clamd needed. With
  `CLAMAV_ENABLED=true` the worker streams each object to `clamd` over TCP
  (`CLAMAV_HOST:CLAMAV_PORT`, timed out at `CLAMAV_TIMEOUT_MS`).
- Locally, `docker-compose.dev.yml` provides a `clamav` service (port `3310`);
  first boot downloads virus signatures, so its healthcheck has a long
  `start_period`. The `worker` compose service runs the worker from the same
  backend image (`pnpm worker:start`).
- Staging/prod run the **worker as its own process/container** (same image,
  different entrypoint) pointed at managed Redis + a clamd instance.

## Staging notes

- `DOCS_ENABLED=true` so reviewers can browse `/api/docs`; flip to `false` in prod.
- `RATE_LIMIT_ENABLED=true` with a real managed Redis — limiter fails **open** if
  Redis is unreachable (see [`rate-limiting.md`](./rate-limiting.md)).
- Run migrations on deploy from the **compiled build**: `pnpm run migration:run:prod`
  (`-d dist/src/config/db.js`); `pnpm run migration:run` is the dev/ts-node path.
  Never `synchronize` outside dev.
- Set `CORS_ALLOWED_ORIGINS` to the staging web origin, not localhost.
- Run the **AV-scan worker** as a separate process from the same backend image
  (`pnpm worker:start`), pointed at managed Redis (and clamd if `CLAMAV_ENABLED=true`).

## OpenFGA

- **Dedicated database.** Locally the `openfga-db` one-shot creates `openfga`
  next to `blitz_vault` on the same Postgres. Staging/prod: a separate database
  (or instance) on managed Postgres, URI from the secret store — never share the
  app's DB, and never let a test teardown reach it.
- **Two release steps, in order:** `openfga migrate` (OpenFGA's own schema) before
  rolling the server, then push the model with `pnpm fga:init` from a pipeline
  job. Locally that is the compose one-shots plus `pnpm fga:init --write-env`.
- **Model id is pinned at boot** (`FGA_MODEL_ID`). A model change is therefore a
  deploy: run `fga:init`, update the secret, restart the API and worker.
- **Unauthenticated only locally.** The adapter uses `CredentialsMethod.None`.
  Staging/prod OpenFGA must sit behind a preshared key or OIDC — wiring that env
  into the adapter is a later task; do not expose an unauthenticated OpenFGA.
- **Staging is not provisioned** (no provider chosen as of 2026-09-14).

## Container images

- Both apps ship **multi-stage** Docker images ([`backend/Dockerfile`](../backend/Dockerfile),
  [`frontend/Dockerfile`](../frontend/Dockerfile)): a build stage compiles (all deps),
  and a slim runtime stage keeps only what serves traffic — backend runs
  production deps + `dist`; frontend runs the Next.js **standalone** bundle.
- Runtime stages run as the **non-root** `node` user (uid 1000) and expose a
  BusyBox-`wget` `HEALTHCHECK` (backend `/healthz`, frontend `/`).
- **Backend and the worker are the same image**, different entrypoints:
  API = `node dist/server.js` (default `CMD`); worker = `pnpm worker:start`
  (`node dist/src/workers/index.js`).
- CI builds both images and gates merges on **Trivy** (`HIGH,CRITICAL`,
  `ignore-unfixed`, `scanners: vuln`). Results also upload as **SARIF** to the
  repo Security tab (categories `trivy-backend` / `trivy-frontend`), and a
  **weekly scheduled** run re-scans the pinned images for newly-disclosed CVEs.
  Accepted/unfixable findings are suppressed (justified + dated) in
  [`.trivyignore`](../.trivyignore). See [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

## Smoke checks (any environment)

```bash
curl -s $BASE/healthz                         # {"data":{"status":"ok",...}}
curl -s $BASE/readyz                          # 200 if DB reachable, else 503
curl -s -o /dev/null -w '%{http_code}' $BASE/api/docs/   # 200 when DOCS_ENABLED=true
```

See also: [`.env.example`](../.env.example), [`backend/.env.example`](../backend/.env.example),
[`frontend/.env.example`](../frontend/.env.example), [`.github/workflows/ci.yml`](../.github/workflows/ci.yml),
[`docker-compose.dev.yml`](../docker-compose.dev.yml).
