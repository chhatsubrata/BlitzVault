# BlitzVault — Execution Roadmap

> Principal Architect plan. 3 developers, parallel execution, phase-gated delivery.
> Based on actual repo state (snapshot date: 2026-05-21).

---

# PROJECT ANALYSIS

## Current Tech Stack

| Layer | In Use | Notes |
|---|---|---|
| Frontend | Next.js 16 (App Router), React 19, TS | Strict TS not yet enforced |
| Backend | Node + Express 5, TS, ts-node | No Nest, no DI container |
| Database | PostgreSQL 16 (docker-compose) | Single service, no pooler |
| ORM | TypeORM 0.3 | `synchronize: true` — **dev-only**, dangerous for prod |
| Auth | Clerk (`@clerk/backend`, `@clerk/nextjs`) | Session JWT → backend sync |
| Authz | None | OpenFGA planned, not integrated |
| Storage | None | S3/R2/Cloudinary planned |
| State (FE) | TanStack Query 5 | No Zustand/Redux |
| UI | ShadCn UI, Tailwind 4, Lucide, Lottie | |
| Realtime | None | Socket.io / Liveblocks pending decision |
| Validation | Zod 4 (FE + BE) | Symmetric schemas, good |
| Deployment | None | No Dockerfile for app, no CI |

## Current Completion Status

**Completed**
- Clerk-based auth (sign-up, sign-in, email verification, SSO callback)
- Backend `/auth/sync` endpoint mirroring Clerk user into local `Users` table
- Zod-validated request layer + reusable response helpers
- Auth UX state-machine hook (`use-auth-form.ts`) + form card components
- Postgres docker-compose
- Basic user CRUD endpoints (admin-style, not yet wired into UI)

**Partial**
- Auth middleware: relies on static `AUTH_BEARER_TOKEN` — must move to Clerk JWT verify
- Google OAuth backend route exists but is deprecated in code comments
- `Users` entity stores `password` field unused (Clerk is SoT) — confusing

**Missing**
- File / Folder entities, upload pipeline, storage adapter
- Sharing, RBAC, OpenFGA model + tuples
- Realtime collab, presence, activity feed
- Search (full-text + semantic), previews, versioning, trash, starred
- Workspace / team / org primitives
- Notifications, AI features
- Migrations, seed data, tests, CI, observability, rate-limit, error tracking

## Critical Issues / Risks

1. **`synchronize: true`** in TypeORM — schema drift risk. Must replace with migrations before any prod data lands.
2. **Static bearer token middleware** — accepts a single shared secret. Must be replaced with Clerk JWT verification (`@clerk/backend.verifyToken`).
3. **Dead `password` column** on `Users` — drop or document. Currently bcrypted on signup but never validated against.
4. **No transactional outbox / audit log** — every later feature (share, permission, billing) will need this; cheap to add now, painful later.
5. **No request logger / correlation ID** — debugging multi-service flows will be impossible.

## Recommended Architecture Improvements

**Immediate (Phase 0)**
- Replace `synchronize` with TypeORM migrations
- Real Clerk JWT verification middleware
- Centralized error handler + pino logger + request ID
- Rate limiter (`express-rate-limit` + Redis)
- Drop unused `password` column from `Users`

**Mid-term (Phase 1–3)**
- Storage abstraction (`StorageAdapter` interface; S3 / R2 / Cloudinary swappable)
- Authorization service wrapping OpenFGA with permission cache (Redis)
- Event bus (Redis Streams or BullMQ) for async work — thumbnails, indexing, AV scan, audit
- Pagination + cursor strategy across list endpoints
- API versioning under `/api/v1` (already partial)

**Long-term (Phase 4+)**
- Move to NestJS only if module boundaries grow painful; otherwise keep Express + folder-feature pattern
- Read-replica strategy + Postgres logical sharding by `workspace_id`
- Vector store (pgvector or Qdrant) for semantic search
- CDN signed URLs + range request support for large file streaming
- Multi-region storage replication

---

# EXECUTION ROADMAP (PHASES)

## Phase 0 — Foundation Hardening
**Goal:** make current code production-safe before adding features.
**Outcome:** migrations, real auth, logger, error handler, rate limit, CI skeleton.
**Dependencies:** none.
**Complexity:** Low–Med.
**Risks:** TypeORM migration baseline must be cut cleanly from current schema.
**Parallel:** Dev1 (BE infra) + Dev2 (FE infra: error boundary, query client, layout shell) + Dev3 (DevOps: CI, Dockerfiles, env management).

## Phase 1 — Core File System
**Goal:** upload, download, folder tree, list, rename, move, delete (soft).
**Outcome:** working drive UI with persisted files in S3/R2.
**Dependencies:** Phase 0.
**Complexity:** High.
**Risks:** multipart upload, resumability, mime sniffing, large-file memory pressure.
**Parallel:** Dev1 (BE: storage adapter, file/folder entities, upload signing) + Dev2 (FE: file grid/list, uploader, breadcrumbs) + Dev3 (Cloudinary on-delivery thumbnails + virus scan stub). _(Thumbnails landed as Cloudinary URL transforms, not a queue worker.)_

## Phase 2 — Authorization (OpenFGA) + Sharing
**Goal:** ReBAC model live, share dialog, public links, role assignment.
**Outcome:** every file/folder access gated through OpenFGA check with cache.
**Dependencies:** Phase 1 entities.
**Complexity:** High. R&D phase mandatory (see §OpenFGA below).
**Risks:** tuple write fan-out on folder move; cache invalidation; permission inheritance correctness.
**Parallel:** Dev1 (OpenFGA service + middleware) + Dev2 (Share UI, member picker, link mgmt) + Dev3 (tuple migration tool + perf benchmark harness).

## Phase 3 — Workspaces, Activity, Notifications
**Goal:** multi-tenant workspaces, audit/activity feed, in-app + email notifications.
**Outcome:** team SaaS shape; users belong to workspaces; every mutation emits event.
**Dependencies:** Phase 2 (workspace = OpenFGA root).
**Complexity:** Med.
**Parallel:** Dev1 (workspace BE + invites) + Dev2 (workspace switcher, activity feed UI, notification center) + Dev3 (event bus + email worker via Resend/Postmark).

## Phase 4 — Search, Preview, Versioning, Trash, Starred
**Goal:** discoverability + safety net features.
**Outcome:** Postgres FTS + filename/metadata search, preview for PDF/img/video, file versions, restore from trash, starred items.
**Dependencies:** Phases 1–3.
**Complexity:** Med–High.
**Parallel:** Dev1 (versioning + trash BE) + Dev2 (preview pane, search UI, command palette) + Dev3 (FTS indexer worker, thumbnail pipeline).

## Phase 5 — Realtime Collaboration
**Goal:** presence, live cursors on previews, live folder updates, comments.
**Outcome:** Socket.io or Liveblocks-backed sync; optimistic UI everywhere.
**Dependencies:** Phase 3 events.
**Complexity:** High.
**Parallel:** Dev1 (WS gateway, presence service) + Dev2 (presence avatars, optimistic mutations) + Dev3 (scaling tests, Redis adapter, sticky sessions).

## Phase 6 — AI & Productivity
**Goal:** semantic search, summarization, smart tagging, duplicate detection, AI assistant.
**Outcome:** pgvector store, ingestion pipeline, Anthropic Claude API for summaries.
**Dependencies:** Phase 4 search infra.
**Complexity:** High.
**Parallel:** Dev1 (embedding pipeline + vector queries) + Dev2 (AI panel UI, chat) + Dev3 (cost monitoring, prompt eval harness).

## Phase 7 — Performance, Security, Launch
**Goal:** harden, observe, ship.
**Outcome:** load-tested, pen-tested, monitored, documented.
**Complexity:** Med.
**Parallel:** Dev1 (query perf, N+1, indexes) + Dev2 (a11y, keyboard, polish) + Dev3 (Sentry, OTel, k6 load tests, runbooks).

---

# OPENFGA R&D & ARCHITECTURE

## Why OpenFGA (vs RBAC / ABAC / ReBAC bespoke)

| Approach | Fit | Verdict |
|---|---|---|
| Pure RBAC (roles in DB) | Easy, but explodes on per-resource sharing (Drive-style) | ❌ |
| ABAC (policy engine) | Flexible but slow + hard to audit at file granularity | ❌ |
| Bespoke ReBAC tables | Works but reinvents Zanzibar; cache + consistency hard | ❌ |
| **OpenFGA (Zanzibar)** | Purpose-built for fine-grained ReBAC, hierarchical, fast `check` API, audit-friendly | ✅ |

OpenFGA fits BlitzVault because (a) folder-tree permission inheritance is native, (b) sharing-by-relation is a first-class concept, (c) public-link tokens map cleanly to ephemeral tuples, (d) check API latency is sub-10ms with caching.

## Proposed Authorization Model (DSL sketch)

```
model
  schema 1.1

type user

type organization
  relations
    define member: [user]
    define admin:  [user]

type workspace
  relations
    define organization: [organization]
    define owner:  [user]
    define admin:  [user] or admin from organization
    define member: [user] or member from organization
    define viewer: [user]
    define can_create_folder: admin or member
    define can_manage:        owner or admin

type folder
  relations
    define parent:    [folder, workspace]
    define owner:     [user]
    define editor:    [user, team#member] or editor from parent
    define viewer:    [user, team#member, public_link] or viewer from parent or editor
    define can_write: owner or editor
    define can_read:  viewer or can_write

type file
  relations
    define parent:    [folder]
    define owner:     [user]
    define editor:    [user, team#member] or editor from parent
    define viewer:    [user, team#member, public_link] or viewer from parent or editor
    define can_read:  viewer or editor or owner
    define can_write: owner or editor
    define can_share: owner or editor

type team
  relations
    define workspace: [workspace]
    define member:    [user]

type public_link
  relations
    define resource: [file, folder]
    define accessor: [user, user:*]   # user:* = anonymous
```

## Tuple Strategy

- Write tuples **inside the same DB transaction** as resource creation via outbox → OpenFGA writer worker. Avoid dual-write inconsistencies.
- On folder move: only re-write `parent` tuple for moved folder. Inheritance handles rest. **No fan-out.**
- On share: single `editor`/`viewer` tuple per principal.
- Public link: create `public_link` object + tuple `(public_link:<id>#accessor, user:*)` + `(file:<id>#viewer, public_link:<id>#accessor)`.

## Permission Check Pattern

```
async authorize(userId, action, resource) {
  const cacheKey = `fga:${userId}:${action}:${resource}`;
  const hit = await redis.get(cacheKey);
  if (hit !== null) return hit === '1';
  const ok = await fga.check({ user: `user:${userId}`, relation: action, object: resource });
  await redis.setex(cacheKey, 30, ok ? '1' : '0'); // 30s TTL
  return ok;
}
```

- Cache 30s, invalidate on tuple write by pattern delete `fga:*:${resource}`.
- Bulk endpoints: `batchCheck` instead of N round-trips.

## DB Schema Impact

- New `fga_outbox` table (id, type, tuple, status, created_at) for reliable writes.
- New `audit_log` table consuming same outbox stream.
- No coupling of permissions into resource tables — they live in OpenFGA only.

## Middleware Architecture

```
router.get('/files/:id',
  requireClerkAuth,
  loadResource('file'),
  authorize('can_read'),
  filesController.get
);
```

`authorize(relation)` middleware reads `req.user.id` + `req.resource`, calls `AuthorizationService.check`, 403s on miss.

## Risks

- OpenFGA cluster availability = hard dep. Mitigate: circuit breaker → deny-by-default; readiness probe in load balancer.
- Tuple drift: outbox replay tool mandatory.
- Public links require care to avoid leaking via `user:*`. Always scope through `public_link` intermediate.

---

# TASK ASSIGNMENT — 3 DEVELOPERS

Roles fixed across phases for ownership, but each dev rotates frontends/backends per phase.

## Developer 1 — Backend / Platform Lead
**Owns:** API, DB, OpenFGA, storage, workers, security middleware.

### Phase 0 tasks
- **T1.0.1 Migrations baseline**
  - Why: `synchronize: true` is prod-unsafe.
  - Approach: snapshot current schema → first migration `0001_init`; flip `synchronize: false` in non-dev envs; add `migration:run` script.
  - Files: `backend/src/config/db.ts`, new `backend/migrations/`, `package.json`.
  - DB: no schema change, just baseline.
  - Acceptance: `pnpm migration:run` on empty PG produces identical schema; CI step added.
- **T1.0.2 Clerk JWT auth middleware**
  - Why: static bearer is insecure.
  - Approach: replace `auth.middleware.ts` with `verifyToken` from `@clerk/backend`; attach `req.auth = { userId, sessionId, orgId }`.
  - Files: `backend/src/middleware/auth.middleware.ts`, `requireAuth.ts`, all routes.
  - Security: rotate `CLERK_SECRET_KEY` via env only; reject on missing claims.
  - Acceptance: requests without valid Clerk JWT → 401; existing `/auth/sync` flow still passes integration test.
- **T1.0.3 Error handler + pino logger + request ID**
  - Files: new `backend/src/middleware/{errorHandler,requestLogger}.ts`, `utils/logger.ts`.
  - Acceptance: every response logged with `reqId`, `userId`, `latency_ms`; errors include stack only in dev.
- **T1.0.4 Drop unused `password` column on Users**
  - Migration `0002_drop_users_password`.

### Phase 1 tasks
- **T1.1.1 File & Folder entities + migrations**
  - Entities: `Folder(id, workspace_id, parent_id, name, owner_id, created_at, updated_at, deleted_at)`, `File(id, folder_id, name, size, mime, storage_key, checksum, owner_id, version, deleted_at, ...)`.
  - Indexes: `(workspace_id, parent_id)`, `(folder_id, deleted_at)`, `lower(name) gin trgm` for search later.
- **T1.1.2 Storage adapter**
  - `StorageAdapter` interface; `S3Adapter` + `R2Adapter` impls; presigned PUT for direct-to-bucket upload, presigned GET for download.
  - Files: `backend/src/services/storage/*`.
- **T1.1.3 Upload init/complete endpoints**
  - `POST /files/upload/init` → returns presigned URL + fileId.
  - `POST /files/upload/complete` → confirms ETag, writes DB row.
  - Validation: max size by mime, mime allow-list.
- **T1.1.4 Folder CRUD endpoints**
  - Create, rename, move, list (cursor pagination), soft-delete.

### Phase 2 tasks
- **T1.2.1 OpenFGA service wrapper + outbox writer worker**
- **T1.2.2 `authorize(relation)` middleware**
- **T1.2.3 Sharing endpoints (`/files/:id/share`, `/folders/:id/share`, public links)**
- **T1.2.4 Permission cache layer (Redis)**

### Phase 3–7
- Workspace BE, activity event bus, versioning, vector embedding pipeline, perf indexes.

**APIs:** all under `/api/v1/{auth,users,files,folders,share,workspaces,activity}`.
**DB:** owns every migration.
**Priority:** P0 → Phase 0; P1 → Phase 1; etc.

---

## Developer 2 — Frontend / UX Lead
**Owns:** Next.js app shell, design system, all user-facing flows.

### Phase 0 tasks
- **T2.0.1 App shell + query client + error boundary**
  - Global `Providers` with `QueryClient`, `ErrorBoundary`, toast container.
  - Files: `frontend/app/providers.tsx`, `frontend/app/error.tsx`, `frontend/app/global-error.tsx`.
- **T2.0.2 Layout: sidebar + topbar skeleton**
  - Routes scaffold: `/(app)/drive`, `/(app)/shared`, `/(app)/starred`, `/(app)/trash`, `/(app)/settings`.
  - Components: `Sidebar`, `Topbar`, `Breadcrumbs`, `ContextMenu`.
- **T2.0.3 Strict TS + ESLint + Prettier config**
- **T2.0.4 Auth pages polish** — fix Google OAuth deprecation, remove dead UI, align with Phase 0 BE auth changes.

### Phase 1 tasks
- **T2.1.1 File grid + list view** with virtualization (`@tanstack/react-virtual`).
- **T2.1.2 Folder tree + breadcrumbs**.
- **T2.1.3 Uploader**: drag-drop, multi-file, progress, retry, paste-from-clipboard. Uses presigned PUT directly to bucket; reports progress via `XMLHttpRequest` (fetch lacks upload progress).
- **T2.1.4 Rename / move / delete flows** with optimistic updates via React Query.
- **T2.1.5 Empty states + skeletons + keyboard nav** (j/k, ↵ open, ⌫ trash).

### Phase 2 tasks
- **T2.2.1 Share dialog** (member search, role select, public link toggle, copy link).
- **T2.2.2 Permission badges** on file cards.
- **T2.2.3 Access-denied UX** (graceful 403 page).

### Phase 3 tasks
- **T2.3.1 Workspace switcher + invites UI**.
- **T2.3.2 Activity feed pane** (right drawer).
- **T2.3.3 Notification center**.

### Phase 4–6
- Preview pane (PDF.js, image, video, code), command palette (cmd-k), versions UI, semantic search results, AI chat panel.

**Files/folders:** `frontend/app/**`, `frontend/components/**`, `frontend/hooks/**`.
**Priority:** mirrors phase.

---

## Developer 3 — DevOps / Realtime / Data
**Owns:** infra, CI/CD, observability, workers, search, realtime, perf.

### Phase 0 tasks
- **T3.0.1 Dockerfiles** for backend + frontend; multi-stage; non-root user.
- **T3.0.2 docker-compose.dev.yml** adding Redis, MailHog, OpenFGA local.
- **T3.0.3 GitHub Actions CI**: lint, typecheck, test, build, migration dry-run.
- **T3.0.4 Env management**: `.env.example`, `dotenv-vault` or 1Password CLI doc.
- **T3.0.5 Pre-commit hooks** (lefthook): lint-staged, typecheck, secret scan.

### Phase 1 tasks
- **T3.1.1 Background worker harness** (BullMQ + Redis). _Demo spike only in Phase 1 — no real queue consumers landed (thumbnails moved to Cloudinary on-delivery)._
- **T3.1.2 Thumbnails** — **implemented via Cloudinary on-delivery URL transforms** (`getThumbnailUrl`), not a worker. A sharp/ffmpeg worker (incl. video keyframes) is deferred to a later phase if offline processing is needed.
- **T3.1.3 AV scan worker stub** (ClamAV container, async).
- **T3.1.4 Rate limiter** (`express-rate-limit` + Redis store).

### Phase 2 tasks
- **T3.2.1 OpenFGA infra**: cluster compose service, persistent store, init job to load model.
- **T3.2.2 Tuple migration / replay tool** (CLI under `backend/src/scripts/`).
- **T3.2.3 Perf benchmark harness** for `check` latency.

### Phase 3 tasks
- **T3.3.1 Event bus** (Redis Streams) + consumers (notification, activity, search-indexer).
- **T3.3.2 Email worker** via Resend/Postmark.

### Phase 4–7
- FTS indexer, pgvector cluster, Socket.io gateway + Redis adapter, Sentry + OTel, k6 load tests, Grafana dashboards.

**Priority:** P0 infra → P1 workers → P2 OpenFGA → P3 events → P5 realtime → P7 observability.

---

# TASK FORMAT TEMPLATE (use for every ticket)

```
Title:
Why it matters:
Technical approach:
Files / modules:
Backend changes:
Frontend changes:
DB changes:
API changes:
Validation (Zod):
Security:
Performance:
Edge cases:
Acceptance criteria:
```

---

# PARALLEL EXECUTION STRATEGY

## What runs simultaneously

| Phase | Dev1 | Dev2 | Dev3 | Conflict risk |
|---|---|---|---|---|
| 0 | migrations + auth mw | app shell + auth UI polish | Dockerfiles + CI | Low — distinct files |
| 1 | entities + upload API | file UI + uploader | Cloudinary on-delivery thumbnails | Med — coordinate API contract day-1 via shared Zod schemas in `backend/src/validators` re-exported |
| 2 | OpenFGA service | share UI | OpenFGA infra | Med — model file shared; freeze model before tuple writers |
| 3 | workspace BE | workspace UI | event bus | Low |
| 4 | versioning/trash BE | preview/search UI | FTS indexer | Low |
| 5 | WS gateway | optimistic UI | realtime scale | High — agree on event schema first |
| 6 | embeddings | AI panel | vector infra | Low |
| 7 | perf | polish | observability | Low |

## Blockers

- Phase 1 cannot start until Phase 0 migrations land (Dev1 first-mover).
- Phase 2 cannot start until OpenFGA model is frozen — **one-week R&D spike** owned by Dev1 + Dev3 jointly before Phase 2 begins.
- Phase 5 cannot start until Phase 3 event schema is stable.

## Branching / Git workflow

- Trunk: `main` (protected, required reviews + CI green).
- Per-feature branches: `feat/<phase>-<short-desc>` (e.g. `feat/p1-upload-init`).
- PR rules: ≤400 LOC, one reviewer mandatory, CI green, conventional commits.
- Phase merge order: backend contracts merge before frontend that consumes them; feature flags (`unleash` or `flagsmith`) gate WIP UI behind toggles so FE can ship to `main` early.

## Merge order per sprint (typical)

1. Dev1 BE PR (schema/API) → reviewed by Dev2 for contract sanity.
2. Dev3 infra/worker PR.
3. Dev2 FE PR consuming new API behind feature flag.

---

# CODE QUALITY REQUIREMENTS

- Strict TS, no `any`, no `// @ts-ignore` without comment + tracking issue.
- Zod schemas as single source of truth → infer FE + BE types.
- Feature folders: `backend/src/features/<feature>/{controller,service,repository,schema,routes}.ts`. **Refactor current `controllers/services/routes` flat layout into feature folders during Phase 0** (Dev1).
- React: server components by default, `'use client'` only when needed; no business logic in components; hooks for data, components for view.
- Tests: Vitest BE + FE; Playwright E2E for golden paths from Phase 1 onward. Coverage gate ≥ 60% by Phase 3.
- Logging: structured JSON via pino; never log secrets or full JWTs.
- Errors: typed error classes (`AppError`, `AuthzError`, `NotFoundError`); central handler maps to HTTP.
- Caching: HTTP `Cache-Control` for static, Redis for permission + session, React Query cache config standardized.

---

# MODERN UX REQUIREMENTS

- Command palette (⌘K) — Phase 4. Powers search, navigation, quick actions.
- Keyboard shortcuts: j/k navigate, ↵ open, ⌫ trash, ⌘D download, ⌘⇧S share. Show via `?` overlay.
- Drag/drop everywhere: upload, move between folders, reorder.
- Optimistic mutations for rename/move/star/delete.
- Skeletons sized to final content; no layout shift.
- Empty states: illustrated, with primary CTA.
- Motion: Framer Motion subtle (≤200ms, ease-out), respect `prefers-reduced-motion`.
- A11y: focus rings, aria labels, full keyboard reachability, screen-reader announcements for async ops.
- Responsive: collapse sidebar < 1024px, bottom nav < 640px.
- Theming: light/dark/system, OKLCH color tokens.
- Dense + comfortable density toggle (Linear-style).

---

# ADVANCED FEATURES (Real-world)

| Feature | Complexity | Arch impact | Scale impact | MVP? |
|---|---|---|---|---|
| AI doc summarization | Med | New ingestion worker + LLM client | LLM cost ∝ uploads; queue + cache | Post-MVP (Phase 6) |
| Semantic search | High | pgvector or Qdrant; embedding pipeline | Index size linear in content | Post-MVP (Phase 6) |
| Smart tagging | Med | Vision + text classifier worker | Background batch ok | Post-MVP |
| Duplicate detection | Low | Checksum + perceptual hash columns | Cheap if hashed at upload | **MVP (Phase 1)** — store sha256, surface in Phase 4 |
| Realtime collab | High | WS gateway, presence, CRDT for docs | Sticky sessions, Redis pub/sub | Phase 5 |
| Activity replay | Med | Append-only event log, time travel UI | Storage grows linearly | Phase 3 base, replay UI Phase 4 |
| Offline sync | High | Service worker, IndexedDB, conflict resolution | Conflict surface large | Post-launch |
| File insights | Low | Aggregate over activity log | Cheap with rollup tables | Phase 4 |
| Secure share links | Med | Ephemeral OpenFGA tuples, link tokens with expiry/password | Token table churn | **MVP (Phase 2)** |
| Audit system | Med | Immutable log table + export | Bounded by retention | **MVP (Phase 3)** |
| Storage analytics | Low | Periodic rollup job per workspace | Cheap | Phase 4 |
| AI assistant chat | High | Conversation state, RAG over user files | LLM cost real | Phase 6 |
| Workspace management | Med | Org/workspace/team hierarchy in OpenFGA | Core to multi-tenant | **MVP (Phase 3)** |

---

# FINAL DELIVERABLE

## 1. Recommended execution order
Phase 0 → 1 → (OpenFGA R&D spike) → 2 → 3 → 4 → 5 → 6 → 7.

## 2. MVP scope
- Auth (done) + hardened middleware
- Workspaces (single workspace per user OK at MVP)
- File upload / download / folder CRUD
- Sharing (user-to-user + public link) via OpenFGA
- Trash + restore
- Activity log
- Search (filename + metadata, no semantic)
- Responsive modern UI with keyboard nav

## 3. Post-MVP scope
- Realtime presence + collab
- Versioning UI (storage of versions done at MVP, UI later)
- Semantic search + AI features
- Offline sync
- Mobile app

## 4. Production-readiness checklist
- [ ] Migrations only, no `synchronize`
- [ ] Clerk JWT verified on every protected route
- [ ] OpenFGA check on every resource access, cached
- [ ] Rate limiting on auth + upload + share endpoints
- [ ] Centralized error handler, no stack traces leaked
- [ ] Structured logs with request ID
- [ ] Health + readiness endpoints
- [ ] Graceful shutdown (drain HTTP, drain workers)
- [ ] Backups: daily PG snapshot + PITR, lifecycle on S3 bucket
- [ ] Secrets in vault, never in repo
- [ ] CSP, HSTS, secure cookies, CORS allow-list per env
- [ ] Dependency scanning (Dependabot + npm audit in CI)
- [ ] Container image scanning (Trivy)
- [ ] Disaster recovery runbook

## 5. Scaling readiness checklist
- [ ] DB connection pooler (PgBouncer)
- [ ] Read replicas wired via separate DataSource
- [ ] Redis cluster mode for cache + queues
- [ ] OpenFGA horizontal scale + cache
- [ ] S3 multipart for >100MB files, range GET for downloads
- [ ] CDN in front of public links + thumbnails
- [ ] WebSocket sticky sessions + Redis adapter
- [ ] Worker autoscale on queue depth
- [ ] Index review every release (pg_stat_statements)
- [ ] N+1 audit per feature (`pg_stat_statements` + APM)

## 6. Security checklist
- [ ] Clerk JWT verification (no static bearer)
- [ ] OpenFGA deny-by-default
- [ ] Signed, expiring URLs for storage access
- [ ] AV scan before file marked `ready`
- [ ] Mime sniff server-side, not trust client
- [ ] Filename sanitization (no path traversal)
- [ ] Public link tokens 256-bit, optional password + expiry
- [ ] Audit log immutable + tamper-evident (hash chain)
- [ ] PII encryption at rest (column-level for emails optional)
- [ ] Pen test before GA
- [ ] OWASP Top 10 review per release

## 7. Refactor priority list
1. `synchronize: true` → migrations (P0)
2. Static bearer → Clerk JWT (P0)
3. Flat `controllers/services/routes` → feature folders (P0)
4. Drop `Users.password` column (P0)
5. Remove deprecated Google OAuth backend route (P0)
6. Add `requireAuth` typed `req.auth` augmentation (P0)
7. Extract `responses.ts` into typed `Result<T,E>` helpers (P1)

## 8. Engineering standards
- Conventional commits, semantic-release.
- PR template with screenshots for FE, migration link for BE.
- ADRs (`docs/adr/NNNN-*.md`) for any decision crossing service boundaries.
- Definition of done: code + tests + docs + observability + flag rollout plan.

## 9. CI/CD improvements
- Lint + typecheck + unit + integration on PR.
- E2E Playwright on PR against ephemeral preview env.
- Migration dry-run on PR; block merge if destructive without `--force` label.
- Auto-deploy `main` → staging; manual promote → prod.
- Image build once, promote across envs (no rebuild per env).
- Canary deploy 5% → 25% → 100% with error-rate auto-rollback.

## 10. Monitoring / Logging
- Sentry for FE + BE errors with release + user context.
- OpenTelemetry traces: HTTP → DB → OpenFGA → Storage.
- Pino → Loki / Datadog.
- RED metrics dashboard per service; USE for infra.
- SLOs: API p95 < 300ms; OpenFGA check p95 < 20ms (cached) / 80ms (cold); upload-init p95 < 200ms.
- PagerDuty on SLO burn-rate alerts.
- Synthetic checks every 1min on `/healthz` and signup happy path.

---

**End of roadmap.** Owner per task is the developer named above; cross-cutting concerns require an ADR before implementation.
