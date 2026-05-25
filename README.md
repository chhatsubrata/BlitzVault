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

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind 4, HeroUI, TanStack Query, Clerk
- **Backend**: Express 5, TypeORM, Postgres 16, Zod, Clerk JWT
- **Package manager**: pnpm

## Local development (under 15 minutes)

### Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/installation)
- Docker (Compose v2)

### 1. Start Postgres

```bash
docker compose -f docker-compose.dev.yml up -d
docker compose -f docker-compose.dev.yml ps   # wait for healthy
```

Defaults: `postgres` / `postgres` / `drive_clone` on `127.0.0.1:5432` (see [docs/contracts-week1-monday.md](docs/contracts-week1-monday.md)).

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
pnpm dev              # http://localhost:5001
```

Migration helpers: `pnpm migration:show`, `pnpm migration:revert`.

### 4. Frontend

```bash
cd frontend
pnpm install
pnpm dev              # http://localhost:3000
```

### 5. Verify

- Open [http://localhost:3000](http://localhost:3000), sign up or sign in
- Network tab: `POST /api/v1/auth/sync` to the backend with a Clerk JWT
- Custom auth pages: `/signin`, `/signup`

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

Never commit `.env.local` or real secrets.

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

## Docs

- [Sprint Week 1](docs/sprint-week-1.md)
- [Monday API contracts](docs/contracts-week1-monday.md)
- [API guidelines](docs/api-guidelines.md)
- [Frontend guidelines](docs/frontend-guidelines.md)
