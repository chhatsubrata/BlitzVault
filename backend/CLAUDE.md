# Backend Context

Read first: project root `CLAUDE.md`, `docs/backend-guidelines.md`, `docs/api-guidelines.md`, `docs/database-design.md`, `docs/openfga-model.md`, `docs/auth-architecture.md`.

## Stack

- Node 20+, TypeScript strict.
- Express 5.
- TypeORM 0.3 + Postgres 16.
- Zod 4 (shared with FE).
- `@clerk/backend` for JWT verify.
- Pino + BullMQ + Redis + OpenFGA SDK.

## Current state (2026-05-21)

- Flat `controllers/services/routes/entities/middleware/validators` layout. **Phase 0 refactor → feature folders under `src/features/<name>/`.**
- Auth: Clerk signup/signin/sync working. Backend `auth.middleware.ts` uses static `AUTH_BEARER_TOKEN` — **must be replaced** with `verifyToken` from `@clerk/backend` (P0 task).
- `Users` entity has unused `password` column — **drop in P0 migration**.
- Deprecated Google OAuth backend route — **remove in P0**.
- `synchronize: true` in TypeORM — **flip off, baseline migrations** in P0.
- No file/folder/share/workspace yet.
- No OpenFGA integration yet.
- No error middleware, no request logger, no rate limit, no tests.

## Folder structure (target after P0)

```
src/
  features/<name>/{controller,service,repository,schema,routes,events}.ts
  shared/{middleware,utils,errors,config,events,types}/
  entities/
  migrations/
  workers/
  scripts/
  index.ts
```

## Layering

Controller (HTTP shape) → Service (business logic) → Repository (DB). Acyclic. No DB in controllers. No HTTP in services.

## Middleware chain (per protected route)

`requestId → requestLogger → cors → helmet → rateLimit → validateRequest → requireClerkAuth → loadResource → authorize(relation) → controller → errorHandler`

## Hard rules

- No `any`. No `// @ts-ignore` without ticket.
- No `synchronize: true` outside `NODE_ENV=development`.
- All schema changes via reversible migrations.
- OpenFGA tuple writes via `fga_outbox` table in same DB transaction. Never dual-write.
- Cache OpenFGA `check` 30s in Redis. Invalidate on tuple write.
- Zod `.strict()` on every request schema.
- Pino structured logs with `requestId`. Never log JWTs, presigned URLs, passwords.
- Soft delete via `deleted_at`. Hard delete only via admin script.
- Cursor pagination only.

## Don'ts

- Don't hardcode role checks (`if user.role === 'admin'`). Use OpenFGA relations.
- Don't trust `req.body.userId`. Use `req.auth.userId`.
- Don't read `process.env` outside `shared/config/env.ts`.
- Don't add business logic in middleware (auth + validation excepted).
- Don't bypass `authorize()` for "internal" endpoints — workers use service-JWT.
