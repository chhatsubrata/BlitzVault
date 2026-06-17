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
| `DB_HOST` / `DB_PORT` | `127.0.0.1` / `5432` | managed PG host | managed PG host | Compose PG locally |
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

## Frontend env vars

| Var | Notes |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Public; `pk_test_…` non-prod, `pk_live_…` prod |
| `CLERK_SECRET_KEY` | Server-side only |
| `NEXT_PUBLIC_BACKEND_URL` | `http://localhost:5001` dev; staging/prod API origin |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `_SIGN_UP_URL` / `_AFTER_*` | Clerk redirect routes |

## Storage notes

- **Cloudinary** is the active driver (`STORAGE_DRIVER=cloudinary`). Adapter lives in
  [`backend/src/shared/services/storage/`](../backend/src/shared/services/storage); the
  factory selects by `STORAGE_DRIVER`.
- `s3`/`r2` drivers and a local **MinIO** dev service are **deferred** until an
  S3-compatible driver is actually needed ("based on usage"). The `STORAGE_*`
  vars in `backend/.env.example` are commented placeholders for that future.
- Cloudinary creds (`CLOUDINARY_*`) come from the Cloudinary console; keep them in
  `*.env.local` (local) or the platform secret store (staging/prod) — never committed.

## Staging notes

- `DOCS_ENABLED=true` so reviewers can browse `/api/docs`; flip to `false` in prod.
- `RATE_LIMIT_ENABLED=true` with a real managed Redis — limiter fails **open** if
  Redis is unreachable (see [`rate-limiting.md`](./rate-limiting.md)).
- Run migrations on deploy from the **compiled build**: `pnpm run migration:run:prod`
  (`-d dist/src/config/db.js`); `pnpm run migration:run` is the dev/ts-node path.
  Never `synchronize` outside dev.
- Set `CORS_ALLOWED_ORIGINS` to the staging web origin, not localhost.

## Smoke checks (any environment)

```bash
curl -s $BASE/healthz                         # {"data":{"status":"ok",...}}
curl -s $BASE/readyz                          # 200 if DB reachable, else 503
curl -s -o /dev/null -w '%{http_code}' $BASE/api/docs/   # 200 when DOCS_ENABLED=true
```

See also: [`.env.example`](../.env.example), [`backend/.env.example`](../backend/.env.example),
[`frontend/.env.example`](../frontend/.env.example).
