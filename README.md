# BlitzVault

A cloud storage drive clone with a Next.js frontend and Express/TypeScript backend.

## Project structure

```
BlitzVault/
├── frontend/              # Next.js app (React, TypeScript)
├── backend/               # Express API (TypeORM, Postgres)
├── docker-compose.dev.yml # Local Postgres 16
├── .env.example           # Env setup index (copy to per-app .env.local)
└── docs/                  # Sprint, API contracts, guidelines
```

## Tech stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind 4, ShadCn UI, TanStack Query, Clerk
- **Backend**: Express 5, TypeORM, Postgres 16, Zod, Clerk JWT
- **Package manager**: pnpm

## Local development (under 15 minutes)

### Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/installation)
- Docker (Compose v2)

### 1. Start infra

```bash
docker compose -f docker-compose.dev.yml up -d
docker compose -f docker-compose.dev.yml ps   # wait for healthy
```

Brings up Postgres (host `5434` → container `5432`), Redis (`6379`), Mailpit (`8025` UI), OpenFGA
(`8080` HTTP / `8081` gRPC, on its own `openfga` database) and ClamAV. The two
`openfga-*` one-shots exit `0` once done — that is expected.

Defaults: `postgres` / `postgres` / `blitz_vault` on `127.0.0.1:5434` (host port 5434 so a host-level PostgreSQL on 5432 does not collide) (see [docs/contracts-week1-monday.md](docs/contracts-week1-monday.md)).

### 2. Configure environment

```bash
cp backend/.env.example backend/.env.local
cp frontend/.env.example frontend/.env.local
```

Fill in Clerk keys from [Clerk Dashboard](https://dashboard.clerk.com) in **both** files:

- `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `CLERK_JWT_ISSUER` (backend)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (frontend)

See [.env.example](.env.example) for the full index.

### 3. Backend

```bash
cd backend
pnpm install
pnpm migration:run    # apply schema on empty DB
pnpm fga:init --write-env   # OpenFGA: create store + push model, fill FGA_* in .env.local
pnpm dev              # http://localhost:5001
```

Migration helpers: `pnpm migration:show`, `pnpm migration:revert`.

OpenFGA helpers: `pnpm fga:init` is idempotent (re-run after editing
`src/authz/model.fga`; restart the API afterwards — the model id is pinned at
boot); `pnpm fga:smoke` proves a live `check` round-trip. See
[docs/openfga-model.md](docs/openfga-model.md).

Background worker spike (BullMQ; Redis must be up): `pnpm worker:dev` — enqueues and processes a demo job, then exits.

### 4. Frontend

```bash
cd frontend
pnpm install
pnpm dev              # http://localhost:3000
```

### 5. Verify

- Backend health: `curl -i localhost:5001/healthz` → `200`, `X-Request-Id` header
- Backend readiness (DB reachable): `curl localhost:5001/readyz` → `{"data":{"status":"ready"}}`
- OpenFGA: `curl localhost:8080/healthz` → `{"status":"SERVING"}`; `curl localhost:8080/stores` lists `blitzvault`
- Open [http://localhost:3000](http://localhost:3000), sign up or sign in
- Network tab: `POST /api/v1/auth/sync` to the backend with a Clerk JWT
- Custom auth pages: `/signin`, `/signup`

## Git hooks (pre-commit)

[Lefthook](https://lefthook.dev/) runs ESLint on changed files plus a
[gitleaks](https://github.com/gitleaks/gitleaks) secret scan before every commit.
Config: [`lefthook.yml`](lefthook.yml), [`.gitleaks.toml`](.gitleaks.toml).

```bash
# 1. Install gitleaks (one-time, needs to be on PATH)
brew install gitleaks          # macOS
#  or: see https://github.com/gitleaks/gitleaks#installing

# 2. Wire the hook from the repo root
pnpm install                   # prepare script runs `lefthook install`
#  or explicitly: pnpm run hooks:install
```

On `git commit`, lefthook runs (in parallel): backend ESLint, frontend ESLint,
and `gitleaks protect --staged`. A lint error or detected secret blocks the commit.

- Manual secret scan of staged changes: `pnpm run secrets:scan`
- CI re-runs gitleaks over full history (the `secret-scan` job in [`.github/workflows/ci.yml`](.github/workflows/ci.yml)), so `--no-verify` can't sneak a secret past review.

## Backend API conventions

- **Base path**: `/api/v1`. Auth header: `Authorization: Bearer <clerk-jwt>`.
- **Health probes** (public): `GET /healthz` (liveness), `GET /readyz` (DB `SELECT 1`; `503` if down).
- **Request tracing**: every response carries `X-Request-Id`; logs and error bodies echo the same `requestId`.
- **Structured logging**: Pino. One JSON summary line per request (`reqId`, `route`, `statusCode`, `latencyMs`). JWTs/passwords/tokens redacted.
- **Error envelope** (target shape on new routes, auth/health):
  ```json
  { "error": { "code": "VALIDATION", "message": "...", "details": [], "requestId": "req_..." } }
  ```
  Codes: `UNAUTHENTICATED` `FORBIDDEN` `NOT_FOUND` `VALIDATION` `CONFLICT` `QUOTA_EXCEEDED` `RATE_LIMITED` `UPSTREAM` `INTERNAL`.
- **Legacy envelope** (`{success,message,errors}`) still used by existing users/signup validation; frontend fetcher parses both. See [docs/api-guidelines.md](docs/api-guidelines.md).

## Docker images (skeleton)

Dev workflow uses host `pnpm dev` + compose Postgres. Images are stubs for future CI/CD.

```bash
# Backend (dev CMD — needs --env-file at run)
docker build -f backend/Dockerfile -t blitzvault-backend:dev backend

# Frontend (pass publishable key at build)
docker build -f frontend/Dockerfile \
  --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx \
  -t blitzvault-frontend:dev frontend
```

## Environment variables

| App | File | Template |
|-----|------|----------|
| Backend | `backend/.env.local` | [backend/.env.example](backend/.env.example) |
| Frontend | `frontend/.env.local` | [frontend/.env.example](frontend/.env.example) |
| Index | — | [.env.example](.env.example) |

Never commit `.env.local` or real secrets. See [docs/environments.md](docs/environments.md)
for the full dev / staging / prod variable matrix.

## Scripts

### Frontend (`frontend/`)

| Command | Description |
|---------|-------------|
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript check |

### Backend (`backend/`)

| Command | Description |
|---------|-------------|
| `pnpm dev` | Development server (nodemon) |
| `pnpm migration:run` | Apply pending migrations |
| `pnpm migration:show` | List migration status |
| `pnpm migration:revert` | Revert last migration |
| `pnpm fga:init --write-env` | OpenFGA: find/create store, push `src/authz/model.fga` if changed, write ids to `.env.local` |
| `pnpm fga:smoke` | OpenFGA: live write → check → cleanup round-trip |
| `pnpm worker:smoke` | BullMQ: enqueue → process → ack against Redis |

### Root (`./`)

| Command | Description |
|---------|-------------|
| `pnpm install` | Installs the lefthook git hook (via `prepare`) |
| `pnpm run hooks:install` | Re-wire git hooks explicitly |
| `pnpm run secrets:scan` | gitleaks scan of staged changes |

## Docs

- [Sprint Week 1](docs/sprint-week-1.md)
- [Environments (dev/staging/prod)](docs/environments.md)
- [Rate limiting](docs/rate-limiting.md)
- [Monday API contracts](docs/contracts-week1-monday.md)
- [API guidelines](docs/api-guidelines.md)
- [Frontend guidelines](docs/frontend-guidelines.md)
- [Rate limiting (design spike)](docs/rate-limiting.md)
