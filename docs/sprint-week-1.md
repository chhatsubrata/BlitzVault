# BlitzVault — Sprint Week 1 (3 Developers)

> **Week:** Mon 26 May – Fri 30 May 2026  
> **Based on:** repo state snapshot 2026-05-22  
> **Aligns with:** `docs/roadmap.md` Phase 0 → early Phase 1 prep

---

## Week goal

Ship a **production-safe foundation** so Phase 1 (files/folders/upload) can start without rework.

| By Friday EOD | Owner |
|---|---|
| TypeORM migrations (no `synchronize` in staging/prod) | Dev1 |
| Feature-folder backend layout + typed errors/logger | Dev1 |
| App shell + React Query + typed API client | Dev2 |
| Docker Compose (PG + Redis + MailHog) + CI + env docs | Dev3 |
| Shared Zod API contracts for Phase 1 (frozen Thu) | Dev1 + Dev2 |

---

## Phase focus this week

| Phase | Scope this week | Stretch (Fri only) |
|---|---|---|
| **Phase 0** — Foundation hardening | **Primary (Mon–Thu)** | Finish leftovers |
| **Phase 1** — Core file system | API contract + DB design only | Dev1: entities migration stub |

**Out of scope this week:** OpenFGA, sharing, full upload UI, realtime, AI, search.

---

## Developer roles (fixed for the week)

| Dev | Focus | Owns |
|---|---|---|
| **Dev1** | Backend / platform | Migrations, auth cleanup, feature folders, health/errors, Phase 1 schema |
| **Dev2** | Frontend / UX | Providers, app shell, routes scaffold, fetcher, auth → drive redirect |
| **Dev3** | DevOps / platform | Docker, compose, CI, env, pre-commit, Redis wiring |

---

## Day-by-day overview (all developers)

### Monday — Kickoff & contracts

| Dev | Tasks | Output |
|---|---|---|
| **Dev1** | Baseline migration `0001_init`; `synchronize: false` outside dev; env Zod boot (`shared/config/env.ts`) | Clean migration on empty DB |
| **Dev2** | `app/providers.tsx` (QueryClient, toasts); `lib/fetcher.ts` + `ApiError`; strict TS audit | FE can call API with Clerk JWT |
| **Dev3** | `docker-compose.dev.yml` (Postgres 16); root `.env.example`; backend/frontend Dockerfiles (skeleton) | `docker compose up` brings PG |

**15-min sync:** API base URL, auth header shape, error JSON envelope.

---

### Tuesday — Hardening middleware & shell

| Dev | Tasks | Output |
|---|---|---|
| **Dev1** | Pino logger + request ID middleware; central `errorHandler`; `AppError` types; `/healthz` + `/readyz` | Structured logs per request |
| **Dev2** | `/(app)/layout.tsx` + sidebar/topbar/breadcrumbs skeleton; route stubs: `/drive`, `/shared`, `/starred`, `/trash`, `/settings` | Logged-in users land in app shell |
| **Dev3** | Add Redis + MailHog to compose; GitHub Actions: lint + typecheck + build (BE/FE); migration dry-run job | CI green on `main` |

**Blocker check:** Dev2 needs Dev1's error envelope format (document in `docs/api-guidelines.md`).

---

### Wednesday — Refactor & integrate auth

| Dev | Tasks | Output |
|---|---|---|
| **Dev1** | Migrate flat layout → `backend/src/features/{auth,users}/`; migration `0002_drop_users_password`; remove deprecated Google OAuth routes + dead `requireBearerAuth` | Feature-based BE structure |
| **Dev2** | Post-login redirect to `/drive`; wire `AuthSync` through `fetcher`; `middleware.ts` protect `/(app)/*`; mobile sidebar collapse | Auth → drive flow works E2E |
| **Dev3** | Lefthook pre-commit (lint-staged, secret scan); document local dev in README; rate-limit spike doc (Redis store) | Reproducible dev onboarding |

**Integration test (all):** sign up → sync → see empty drive shell.

---

### Thursday — Phase 1 contract freeze (critical)

| Dev | Tasks | Output |
|---|---|---|
| **Dev1** | Draft `files` + `folders` entities + migration `0003_files_folders` (no upload yet); export Zod schemas: `folderCreate`, `folderList`, `fileUploadInit` | **Frozen API contract** |
| **Dev2** | Feature folders: `features/drive/{api,types,keys}`; empty state + skeleton components; mock list via MSW or static data | UI matches future API shape |
| **Dev3** | OpenFGA + worker placeholders in compose (commented/services stub); BullMQ harness spike (`workers/index.ts`) | Infra ready for Phase 1 workers |

**30-min contract review:** Dev1 presents schemas; Dev2 + Dev3 sign off. **No schema changes after Thu without ADR.**

---

### Friday — Buffer, tests, demo

| Dev | Tasks | Output |
|---|---|---|
| **Dev1** | Vitest setup + 2 integration tests (`/healthz`, `/auth/sync`); fix migration/CI issues; start `StorageAdapter` interface only (no S3 yet); **Swagger/OpenAPI docs at `/api/docs`** (see below) | ≥2 passing BE tests; live API docs |
| **Dev2** | `app/error.tsx` per route segment; keyboard shortcut stub (`?` overlay empty); a11y pass on shell (focus rings, labels) | Polished empty drive |
| **Dev3** | Trivy image scan in CI; staging env vars doc; optional: `express-rate-limit` + Redis on `/auth/sync`; **serve `/api/docs` in staging + CI smoke check it returns 200** | Security baseline in CI; docs reachable |

**Demo (4pm):** Clerk login → `/drive` empty state → logs show `requestId` → CI green → `/api/docs` renders.

#### Swagger / OpenAPI (Dev1, Fri)

Goal: a single browsable page showing every endpoint, its payload, and its responses — generated from the Zod contracts so docs never drift from validation.

- Stack: `swagger-ui-express` + `@asteasolutions/zod-to-openapi` (reuses the frozen Zod schemas — `folderCreate`, `folderList`, `fileUploadInit`, auth/users schemas).
- Build the OpenAPI 3 document in `src/shared/openapi/` (registry of schemas + paths); mount `swagger-ui-express` at `GET /api/docs` (public in dev/staging, gated/off in prod via env).
- Document the **target** response envelope (`{ data, meta }` / `{ error }`) and the `Authorization: Bearer` security scheme + `Idempotency-Key` header on `/files/upload/init`.
- Acceptance: `/api/docs` lists `/healthz`, `/auth/*`, `/users/*`, `/folders` with request/response examples; schemas match Zod 1:1.

---

## Developer-wise detailed breakdown

### Dev1 — Backend / platform

| Day | Task | Files / areas | Acceptance criteria |
|---|---|---|---|
| Mon | Migration baseline | `config/db.ts`, `migrations/`, `package.json` scripts | Fresh PG = same schema as today |
| Mon | Central env validation | `shared/config/env.ts` | Boot fails on missing `CLERK_SECRET_KEY`, DB vars |
| Tue | Logger + request ID | `middleware/requestLogger.ts`, `utils/logger.ts` | Every log line has `reqId`, `route`, `latencyMs` |
| Tue | Error handler + typed errors | `shared/errors/*`, `middleware/errorHandler.ts` | 4xx/5xx JSON envelope; no stack in prod |
| Wed | Feature-folder refactor | `features/auth/*`, `features/users/*` | All routes work; no flat `controllers/` |
| Wed | Drop `password` column | `migrations/0002_*`, `entities/Users.ts` | Column gone; signup still works |
| Thu | File/folder entities + Zod | `features/files/schema.ts`, `features/folders/schema.ts` | Migrations apply; schemas exported for FE |
| Fri | Vitest + health tests | `vitest.config.ts`, `tests/integration/*` | CI runs tests |
| Fri | Swagger/OpenAPI docs | `shared/openapi/*`, `swagger-ui-express` @ `/api/docs` | Docs render; schemas match Zod 1:1 |

**Note:** `requireAuth` already verifies Clerk JWT — focus on removing dead code (`auth.middleware.ts` static bearer), not rewriting auth.

---

### Dev2 — Frontend / UX

| Day | Task | Files / areas | Acceptance criteria |
|---|---|---|---|
| Mon | Providers + QueryClient | `app/providers.tsx`, `lib/query-client.ts` | `staleTime: 30s`, `gcTime: 5m` |
| Mon | Typed fetcher | `lib/fetcher.ts` | Attaches Clerk token; throws `ApiError` |
| Tue | App shell layout | `components/layout/*`, `app/(app)/layout.tsx` | Sidebar + topbar responsive |
| Tue | Route stubs | `app/(app)/drive/page.tsx`, etc. | Nav works; placeholders only |
| Wed | Auth guard + redirect | `middleware.ts`, post-signin URL | Unauthed → `/signin`; authed → `/drive` |
| Wed | AuthSync via fetcher | `app/auth-sync.tsx`, `features/auth/api.ts` | Sync uses shared client |
| Thu | Drive feature scaffold | `features/drive/components/*` | Grid skeleton + empty state + CTA |
| Fri | Error boundaries + a11y | `error.tsx`, focus/aria audit | WCAG AA on shell controls |

**Dependencies:** Thu blocked until Dev1 publishes Zod schemas (import from shared package or copy generated types).

---

### Dev3 — DevOps / infra

| Day | Task | Files / areas | Acceptance criteria |
|---|---|---|---|
| Mon | Postgres compose | `docker-compose.dev.yml` | `pnpm dev` + compose = working DB |
| Mon | `.env.example` (root, BE, FE) | Document all vars | New dev setup < 15 min |
| Tue | Redis + MailHog in compose | Same compose file | Services healthy |
| Tue | GitHub Actions CI | `.github/workflows/ci.yml` | PR blocks on lint/typecheck/build |
| Wed | Lefthook + README | `lefthook.yml`, `README.md` | Pre-commit runs lint |
| Thu | Worker/BullMQ spike | `backend/src/workers/` | Job enqueued + processed locally |
| Fri | Trivy + rate limit | CI security job; optional rate limit on sync | CI pipeline complete |

---

## Phase-wise weekly map

| Phase | Mon | Tue | Wed | Thu | Fri |
|---|---|---|---|---|---|
| **0** | Dev1 migrations; Dev2 providers; Dev3 compose | Dev1 logging; Dev2 shell; Dev3 CI | Dev1 refactor; Dev2 auth flow; Dev3 hooks | Finish P0 gaps | Demo |
| **1 prep** | — | — | — | Dev1 entities; Dev2 UI scaffold; Dev3 workers spike | Dev1 StorageAdapter iface |

---

## Parallel work rules (avoid conflicts)

### Can run in parallel

- Dev1 migrations + Dev3 compose (different files)
- Dev2 shell + Dev1 logger
- Dev3 CI + Dev1 tests (Fri)

### Must sequence

- FE `fetcher` after error envelope agreed (Tue AM)
- Phase 1 Zod schemas before FE `features/drive/api.ts` (Thu)
- Migration `0003` merges before any upload endpoint code

### Branch strategy

- Branches: `feat/p0-<task>`
- PRs: ≤400 LOC, one reviewer, conventional commits
- Merge order: **Dev1 → Dev3 → Dev2** daily

---

## Daily standup agenda (10 min)

| Day | Question |
|---|---|
| Mon | Migration baseline green locally? Compose up? |
| Tue | Error JSON format frozen? CI passing? |
| Wed | E2E auth→drive works? Feature folders merged? |
| Thu | **Contract freeze** — any open API questions? |
| Fri | Demo checklist — what's red? |

---

## End-of-week deliverables (definition of done)

- [ ] `synchronize: false` except explicit local dev flag
- [ ] Migrations `0001`–`0003` run in CI dry-run
- [ ] Clerk JWT on all protected routes (dead static bearer removed)
- [ ] Pino logs + `requestId` on every request
- [ ] `/(app)/drive` shell with empty state
- [ ] `docker compose up` → Postgres + Redis
- [ ] GitHub Actions: lint, typecheck, build, migration check
- [ ] Phase 1 API schemas signed off (Thu)
- [ ] Swagger/OpenAPI docs at `/api/docs` (generated from Zod; reachable in CI/staging)
- [ ] README "Getting started" works for a new machine

---

## Deferred (week 2+)

| Item | Why wait |
|---|---|
| OpenFGA / sharing | Needs Phase 1 entities + R&D spike |
| S3 upload pipeline | After contract + storage env |
| Full file grid + uploader | Consumes Thu schemas |
| Realtime / AI / search | Phase 4–6 per roadmap |
| NestJS migration | Not needed yet |

---

## Week 2 preview

| Dev | Focus |
|---|---|
| Dev1 | Presigned upload init/complete, folder CRUD, S3 adapter |
| Dev2 | File grid, uploader (XHR progress), optimistic rename/delete |
| Dev3 | Cloudinary on-delivery thumbnails, rate limits on upload (MinIO/R2 deferred) |

---

## Current codebase snapshot

| Done | Gap |
|---|---|
| Clerk auth UI + `AuthSync` | No `/(app)/drive` routes |
| `requireAuth` + Clerk verify on `/sync`, `/users` | `synchronize: true`; no migrations |
| Zod validation layer | Flat BE layout; no feature folders |
| TanStack Query in `package.json` | Not wired in providers |
| — | No Docker/CI, Redis, storage, files, OpenFGA |

---

## Related docs

- [Execution roadmap](./roadmap.md)
- [Architecture](./architecture.md)
- [API guidelines](./api-guidelines.md)
- [Backend guidelines](./backend-guidelines.md)
- [Frontend guidelines](./frontend-guidelines.md)
- [Database design](./database-design.md)
