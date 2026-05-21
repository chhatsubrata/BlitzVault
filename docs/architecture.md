# System Architecture

## High-level diagram

```
┌──────────────┐    HTTPS    ┌────────────────┐
│  Next.js FE  │ ──────────▶ │  Express API   │
│  (App Router)│             │  (Node + TS)   │
└──────┬───────┘             └───┬────┬───────┘
       │ Clerk JWT               │    │
       │                         │    │
       │  presigned PUT/GET      │    │ check / write
       ▼                         ▼    ▼
┌──────────────┐         ┌──────────┐ ┌──────────┐
│  S3 / R2     │         │ Postgres │ │ OpenFGA  │
│  (storage)   │         │ (+ FTS,  │ │ (Zanzibar│
│              │         │ pgvector)│ │  ReBAC)  │
└──────────────┘         └──────────┘ └──────────┘
                                 ▲
                                 │ events / cache
                         ┌───────┴──────┐
                         │ Redis        │
                         │ (cache, FGA, │
                         │  BullMQ,     │
                         │  Pub/Sub)    │
                         └───────┬──────┘
                                 │
                         ┌───────▼──────┐
                         │  Workers     │
                         │ (BullMQ):    │
                         │  thumbnails, │
                         │  AV scan,    │
                         │  FTS index,  │
                         │  embeddings, │
                         │  email,      │
                         │  audit       │
                         └──────────────┘
```

## Runtime topology

- **Frontend**: Next.js 16 App Router, deployed on Vercel or container. Server Components default, Client Components for interactivity.
- **API**: Express 5 + TS in container. Stateless. Horizontal scale behind ALB. Sticky sessions only for WS gateway.
- **DB**: Postgres 16. PgBouncer in front. Read replicas added Phase 7.
- **Cache + queues**: Redis (single role at MVP, cluster at scale).
- **AuthZ**: OpenFGA standalone service, Postgres-backed store.
- **Storage**: S3 (primary) with R2 fallback adapter. Direct-to-bucket uploads via presigned URLs.
- **Workers**: separate Node process consuming BullMQ queues.
- **Realtime** (Phase 5): Socket.io gateway with Redis adapter, sticky sessions.

## Request lifecycle (read file)

1. FE: `GET /api/v1/files/:id` with Clerk JWT.
2. API: `requireClerkAuth` → verify JWT → attach `req.auth`.
3. API: `loadResource('file')` → fetch from Postgres.
4. API: `authorize('can_read')` → OpenFGA `check` (Redis cache 30s).
5. API: returns metadata + presigned GET URL (5-min TTL).
6. FE: fetches bytes directly from S3 via URL.

## Request lifecycle (write file)

1. FE: `POST /api/v1/files/upload/init` with `{folderId, name, size, mime}`.
2. API: authorize `can_write` on folder → create File row in `pending` state → return presigned PUT.
3. FE: PUT bytes to S3 directly. Tracks progress via XHR.
4. FE: `POST /files/upload/complete` with ETag.
5. API: verify ETag against S3 → mark `ready` → write OpenFGA tuple `(file#owner, user)` → emit `file.created` event.
6. Workers consume event: thumbnail, AV scan, FTS index, embedding.

## Layering rules

- Controllers: HTTP shape only. No DB calls, no business rules.
- Services: business logic. Pure where possible. Inject repositories.
- Repositories: DB access. Return entities or DTOs. No HTTP awareness.
- Middleware: cross-cutting (auth, validation, rate limit, logging).
- Validators (Zod): single source of truth for shape. Infer types both ends.

## Feature-folder convention (target)

```
backend/src/features/
  files/
    files.controller.ts
    files.service.ts
    files.repository.ts
    files.schema.ts        # Zod
    files.routes.ts
    files.events.ts
  folders/
  share/
  workspaces/
  ...
backend/src/shared/
  middleware/
  utils/
  config/
  errors/
  events/
```

Phase 0 refactor migrates current flat `controllers/services/routes` into this shape.

## Data flow boundaries

- FE talks **only** to BE API. No direct DB/Redis from FE.
- FE talks **directly** to S3 via presigned URLs (read + write).
- BE talks to: Postgres, Redis, OpenFGA, S3 (signing only, no byte streaming), email provider, LLM provider.
- Workers talk to: Postgres, Redis, S3 (read for thumbnails/AV), LLM, OpenFGA.

## State

- **Server state**: Postgres (source of truth).
- **Cache**: Redis. TTLs short (30s permission, 5min metadata).
- **FE state**: TanStack Query (server cache) + URL state. No global store at MVP.
- **Session**: Clerk-owned, JWT in cookie. BE stateless.

## Failure modes

- OpenFGA down → deny-by-default + 503 on writes, degraded reads served from cache if fresh.
- Redis down → cache miss path; OpenFGA + DB carry. Queues block — alerts page.
- S3 down → uploads fail fast; reads fail until restored.
- DB primary down → read replica reads (Phase 7); writes 503.

## Security boundaries

- All external traffic TLS.
- JWT verified at edge of every protected route.
- Presigned URLs short-TTL.
- AV scan before file is `ready` and downloadable to non-owners.
- CSP strict, HSTS preloaded, secure cookies only.

## Observability

- Pino structured logs → Loki/Datadog.
- OTel traces across HTTP → DB → OpenFGA → S3.
- Sentry for unhandled errors.
- RED metrics dashboard per service.
