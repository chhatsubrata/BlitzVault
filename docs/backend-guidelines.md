# Backend Guidelines

## Stack

- Node 20+, TypeScript strict.
- Express 5.
- TypeORM 0.3 + Postgres 16.
- Zod 4 for validation.
- Pino for logging.
- BullMQ + Redis for queues.
- `@clerk/backend` for JWT verify.
- OpenFGA SDK for authz.

## Folder structure (target — Phase 0 refactor)

```
backend/src/
  features/
    <feature>/
      <feature>.controller.ts
      <feature>.service.ts
      <feature>.repository.ts
      <feature>.schema.ts
      <feature>.routes.ts
      <feature>.events.ts
      __tests__/
  shared/
    middleware/
    utils/
    errors/
    config/
    events/
    types/
  entities/        # TypeORM entities (kept central for migration tooling)
  migrations/
  workers/
    thumbnail.worker.ts
    av-scan.worker.ts
    fts.worker.ts
    embedding.worker.ts
    email.worker.ts
  scripts/
  index.ts
```

## Layering rules

1. **Controller** — parses request, calls service, returns response. No DB, no business rules. ≤ 30 lines per handler.
2. **Service** — business logic. Composes repositories. Throws typed `AppError`s.
3. **Repository** — TypeORM access. Returns entities/DTOs. No HTTP awareness.
4. **Schema** — Zod. Exported for FE consumption.
5. **Routes** — wires middleware chain + controller. Pure declarative.

Never import controller from service. Never import service from repository. Acyclic.

## Middleware order

```
app.use(requestId)
app.use(requestLogger)
app.use(cors)
app.use(helmet)
app.use(express.json({ limit: '1mb' }))
app.use(rateLimit)
// per-route:
//   validateRequest(schema)
//   requireClerkAuth
//   loadResource('file' | 'folder' | ...)
//   authorize('can_read' | ...)
//   controller
app.use(notFoundHandler)
app.use(errorHandler)
```

## Error handling

- Custom error base:
  ```ts
  class AppError extends Error {
    constructor(public code: ErrorCode, public httpStatus: number, message: string, public details?: unknown) { super(message); }
  }
  class NotFoundError extends AppError { constructor(m='Not found'){super('NOT_FOUND',404,m);} }
  class AuthzError  extends AppError { constructor(m='Forbidden'){super('FORBIDDEN',403,m);} }
  class ValidationError extends AppError { constructor(details:unknown){super('VALIDATION',400,'Invalid input',details);} }
  ```
- Central `errorHandler` maps to JSON envelope (see `api-guidelines.md`).
- Never `res.status(...).send(err.message)` ad hoc.

## Validation

- Every `req.body`, `req.params`, `req.query` validated via Zod before controller.
- Use `.strict()` to reject unknown keys.
- Reuse schemas across BE + FE via shared package or re-export.

## Database

- **Never** `synchronize: true` outside `NODE_ENV=development` + local DB.
- All schema changes via TypeORM migrations.
- Migrations reversible (`up` + `down`).
- Indexes added in same migration as new query patterns.
- No raw SQL except in repositories, parameterized only.
- Soft delete via `deleted_at` column; hard delete only via admin script.

## Transactions

- Multi-table writes wrap in `dataSource.transaction(async (em) => { ... })`.
- OpenFGA tuple writes go through **outbox** table inside same transaction, replayed by worker. Never dual-write directly.

## Auth

- `requireClerkAuth` verifies `Authorization: Bearer <jwt>` via `verifyToken`.
- Attach `req.auth = { userId, sessionId, orgId }`.
- Never trust `req.body.userId`.

## Authorization (OpenFGA)

- Always via `authorize(relation)` middleware or `authzService.check()`.
- Never hardcode role checks (`if user.role === 'admin'`). Use OpenFGA relations.
- Cache `check` in Redis 30s with key `fga:<user>:<rel>:<obj>`; invalidate by pattern on tuple write.

## Logging

- Pino, JSON, with `requestId`, `userId`, `route`, `latencyMs`.
- Levels: `error` (5xx), `warn` (4xx non-validation), `info` (request summary), `debug` (dev only).
- Never log JWTs, passwords, presigned URLs (query string secrets), full file contents.

## Performance

- Avoid N+1: TypeORM `relations` or explicit join. Add query logger in dev to spot.
- Paginate everything cursor-based.
- Index foreign keys + columns used in `WHERE` / `ORDER BY`.
- Batch OpenFGA checks via `batchCheck` for list endpoints.

## Security

- `helmet()` defaults.
- CORS allow-list per env, never `*` in prod.
- Bcrypt only for any legacy password fields (Clerk is SoT, prefer dropping).
- Input sanitization on filenames (no `..`, no `/`, length ≤ 255, NFC normalize).
- Mime sniff server-side (file-type lib), do not trust `Content-Type`.
- Rate limit per `api-guidelines.md`.

## Testing

- Vitest. Co-located `__tests__/` per feature.
- Unit: services (mock repository).
- Integration: routes against real Postgres (testcontainers) + real OpenFGA (local container).
- Avoid mocking DB at integration layer — past incident learned: mocks hide migration breaks.
- Coverage gate ≥ 60% Phase 3, ≥ 75% Phase 7.

## Workers

- BullMQ queues per concern: `thumbnails`, `av-scan`, `fts-index`, `embeddings`, `email`, `audit`, `fga-outbox`.
- Worker concurrency tuned per queue.
- Retries: exponential backoff, max 5, dead-letter queue.
- Idempotent handlers — jobs may run twice.

## Config

- All config via env vars, parsed once at boot via Zod (`shared/config/env.ts`).
- Fail fast on missing required env at startup, before listening.
- Never read `process.env` outside `env.ts`.

## Commits / PRs

- Conventional commits (`feat:`, `fix:`, `refactor:`, `chore:`).
- PR ≤ 400 LOC, one reviewer, CI green.
- Migration PRs labelled `db:migration` — require extra review.

## Don'ts

- No `any`. No `// @ts-ignore` without ticket.
- No business logic in middleware (auth + validation excepted).
- No hardcoded URLs, secrets, role strings.
- No circular imports.
- No mutating shared singletons.
