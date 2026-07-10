# BlitzVault — Sprint Week 3 (3 Developers)

> **Week:** Mon 9 Jun – Fri 13 Jun 2026
> **Based on:** repo state after Week 2 merge (Phase 1 complete)
> **Aligns with:** `docs/roadmap.md` Phase 2 — Authorization (OpenFGA) + Sharing

> **Prerequisite (must hold before Mon):** the OpenFGA authorization model
> (`docs/openfga-model.md`) is **frozen**. No relation/type edits after the Tue
> model-lock review without an ADR — tuple writers and the FE share UI both
> depend on a stable model. Phase 2 is the R&D-heavy phase; treat the model file
> as a contract, same as the Week 2 upload schema.

---

## Week goal

Ship **gated sharing**: every file/folder read/write flows through an OpenFGA
`check`; owners can share a file or folder with another user (editor/viewer) or
mint a public link; the grid reflects what the caller may actually see. Permission
checks cached in Redis, tuples written through a transactional outbox.

| By Friday EOD | Owner |
|---|---|
| OpenFGA service wrapper + `authorize(relation)` middleware on file/folder routes | Dev1 |
| `fga_outbox` table + writer worker (tuples written in same tx as resource) | Dev1 |
| Share endpoints (`/files/:id/share`, `/folders/:id/share`, public links) | Dev1 |
| Share dialog (member picker, role select, public-link toggle) + permission-aware grid | Dev2 |
| OpenFGA in compose + model-init job + tuple replay CLI + `check` benchmark | Dev3 |
| Redis permission cache (30s TTL) + pattern invalidation on tuple write | Dev1 + Dev3 |

---

## Phase focus this week

| Phase | Scope this week | Stretch (Fri only) |
|---|---|---|
| **Phase 2** — Authorization + Sharing | **Primary (Mon–Fri)** | Public-link password + expiry |
| **Phase 3** — Workspaces | Out of scope (model stays workspace-rooted, no workspace UI) | — |

**Out of scope this week:** workspace switcher UI, org/team management UI,
activity feed, notifications, realtime, AI, search.

---

## Carry-over from Week 2 (fix early)

| Item | Why | Owner |
|---|---|---|
| Staging still not provisioned | Phase 2 sharing needs a non-localhost demo target | Dev3 (Mon) |
| Share/permission fields absent from OpenAPI response envelope | FE needs `permissions`/`shared` shape before share UI | Dev1 (Mon) |
| No deny-by-default guard on file/folder reads (currently owner-only checks in service) | must route through `authorize()` before sharing lands | Dev1 (Tue) |

---

## Starting point (already in repo)

| Done (Week 1–2) | Gap (Week 3 fills) |
|---|---|
| `Files` + `Folders` entities, CRUD, upload/download, soft-delete | Access is owner-only; no share, no inherited perms |
| `docs/openfga-model.md` (DSL: user/org/team/workspace/folder/file/public_link) | Model not loaded into any running OpenFGA store |
| Redis + rate-limit tiers wired | No permission-check cache namespace (`fga:*`) |
| BullMQ worker harness + AV scan worker | No `fga_outbox` writer consumer |
| Idempotency store, cursor pagination, OpenAPI from Zod | No `/share` schemas or paths |
| Feature folders `features/{auth,users,files,folders}` | No `features/sharing` (BE) / `features/sharing` (FE) |

---

## Developer roles (fixed for the week)

| Dev | Focus | Owns |
|---|---|---|
| **Dev1** | Backend / authz | OpenFGA service, `authorize()` middleware, `fga_outbox` + writer, share endpoints, cache |
| **Dev2** | Frontend / UX | Share dialog, member picker, public-link UI, permission badges, 403 UX, permission-aware grid |
| **Dev3** | DevOps / authz infra | OpenFGA compose service, model-init job, tuple replay CLI, `check` benchmark, cache wiring + CI |

---

## Day-by-day overview

### Monday — OpenFGA up + service skeleton

| Dev | Tasks | Output |
|---|---|---|
| **Dev1** | `AuthorizationService` skeleton wrapping `@openfga/sdk` (`check`, `write`, `batchCheck`); env for store/model IDs (`FGA_API_URL`, `FGA_STORE_ID`, `FGA_MODEL_ID`); document share response envelope (`{ permissions, shared }`) | Service `check()` returns live result vs local OpenFGA |
| **Dev2** | `features/sharing` FE scaffold: `api.ts`, `keys.ts`, `types.ts` (mirror BE share Zod); permission badge component (owner/editor/viewer) on card — static data | Badges render; types match model |
| **Dev3** | Add `openfga` + `openfga-migrate` (model push) services to `docker-compose.dev.yml`; `postgres` store backend for OpenFGA; provision **staging** | `docker compose up` → OpenFGA healthy + model loaded |

**15-min sync:** store/model env var names, relation strings used by `authorize()` (`can_read`, `can_write`, `can_share`), share request shape.

---

### Tuesday — Model lock + `authorize()` middleware

| Dev | Tasks | Output |
|---|---|---|
| **Dev1** | `loadResource('file'\|'folder')` + `authorize(relation)` middleware; apply to `GET/PATCH/DELETE /files/:id` and `/folders/:id`; deny-by-default (missing/err → 403); `fga_outbox` migration `0004` (id, type, tuple, status, created_at) | Reads/writes gated by `check`; unauthorized → 403 |
| **Dev2** | Share dialog shell (Radix): member search input, role select (editor/viewer), public-link toggle — wired to mock mutations; optimistic list of shares | Dialog opens from card menu; a11y focus trap |
| **Dev3** | **Model-lock review** (freeze `openfga-model.md`); tuple replay/migration CLI stub (`backend/src/scripts/fga-replay.ts`) reading `fga_outbox`; seed owner tuples for existing files/folders | Existing resources have `owner` tuples in OpenFGA |

**30-min model-lock review:** Dev1 + Dev3 present frozen model; Dev2 signs off on relation names surfaced in UI. **No model changes after Tue without ADR.**

---

### Wednesday — Share endpoints + outbox writer

| Dev | Tasks | Output |
|---|---|---|
| **Dev1** | `POST /files/:id/share` + `/folders/:id/share` (grant editor/viewer to a user), `DELETE` to revoke; write tuple to `fga_outbox` **in same tx** as any resource row; outbox writer worker drains → OpenFGA `write` | Sharing a file grants access E2E |
| **Dev2** | Member picker wired to `/users` search + share mutation (optimistic + rollback); shared-with avatars list on dialog; copy-link affordance | Share a file with a user, see them listed |
| **Dev3** | Wire outbox writer into BullMQ; retry/backoff + dead-letter on OpenFGA write fail; `fga:` cache namespace + pattern invalidation `fga:*:${resource}` on tuple write | Tuple writes reliable; stale cache purged on share |

**Integration test (all):** user A shares file with user B → B can read it → A revokes → B gets 403.

---

### Thursday — Public links + permission-aware grid

| Dev | Tasks | Output |
|---|---|---|
| **Dev1** | Public link: create `public_link` object + tuples (`accessor: user:*`, `viewer` via link); `GET /links/:token` resolves resource with anon `check`; `batchCheck` on list endpoints so grid returns only viewable items | Public link opens file without login; lists filtered |
| **Dev2** | Public-link panel (create/copy/revoke, show link URL); permission-aware grid (hide/disable actions caller can't do); access-denied (403) page + inline "no access" state | Grid actions reflect real permissions |
| **Dev3** | `check` latency benchmark harness (`backend/src/scripts/fga-bench.ts`, p50/p95, cold vs cached); assert cached p95 < 20ms; document results in `docs/openfga-model.md` | Benchmark numbers recorded; SLO met |

---

### Friday — Tests, buffer, demo

| Dev | Tasks | Output |
|---|---|---|
| **Dev1** | Integration tests: `authorize` allow/deny, share grant/revoke, public link, outbox → OpenFGA write; OpenAPI docs for `/share` + `/links` | ≥4 new passing tests; live docs |
| **Dev2** | Share dialog + badges + 403 polish; a11y on member picker/link panel; mobile share sheet | Polished, accessible sharing |
| **Dev3** | OpenFGA service in CI (compose in integration job + model push); tuple replay smoke; Trivy still clean on new deps (`@openfga/sdk`) | Authz covered by CI; scans green |

**Demo (4pm):** A uploads file → shares with B (viewer) → B sees read-only card
(no delete) → A mints public link → open incognito → revoke → 403. CI green,
`check` p95 within SLO.

---

## Developer-wise detailed breakdown

### Dev1 — Backend / authz

| Day | Task | Files / areas | Acceptance |
|---|---|---|---|
| Mon | `AuthorizationService` wrapper | `shared/services/authz/*`, `shared/config/env.ts` | `check`/`write`/`batchCheck` hit local OpenFGA |
| Tue | `authorize()` + `loadResource()` mw | `shared/middleware/authorize.ts`, `features/{files,folders}/*.routes.ts` | Deny-by-default; 403 on miss |
| Tue | `fga_outbox` migration | `migrations/0004_fga_outbox.ts` | Table applies; tuple + status columns |
| Wed | Share endpoints + outbox write | `features/sharing/*`, `features/files`, `features/folders` | Share grants access; write in same tx |
| Wed | Outbox writer worker | `workers/fga/outbox.worker.ts` | Drains outbox → OpenFGA reliably |
| Thu | Public links + `batchCheck` list filter | `features/sharing/links.*`, list controllers | Anon check works; lists filtered |
| Fri | Tests + OpenAPI | `tests/integration/*`, `shared/openapi/*` | ≥4 new tests; docs match |

**Note:** permissions live **only** in OpenFGA — no permission columns on resource tables. Owner is seeded as a tuple, not a DB flag interpreted for authz.

### Dev2 — Frontend / UX

| Day | Task | Files / areas | Acceptance |
|---|---|---|---|
| Mon | Sharing FE scaffold + badges | `features/sharing/{api,keys,types}.ts`, badge component | Types mirror model; badges render |
| Tue | Share dialog shell | `features/sharing/components/share-dialog.tsx` | Radix dialog, a11y focus trap |
| Wed | Member picker + share mutation | `features/sharing/components/member-picker.tsx`, hooks | Optimistic grant + rollback |
| Thu | Public-link panel + permission-aware grid + 403 | `features/sharing/*`, `features/drive/*`, `app/(app)/**` | Actions gated by permission |
| Fri | Polish + a11y + mobile | sharing components | WCAG AA; mobile share sheet |

**Dependency:** Wed member picker blocked until Dev1 exposes `/users` search + share Zod (Tue).

### Dev3 — DevOps / authz infra

| Day | Task | Files / areas | Acceptance |
|---|---|---|---|
| Mon | OpenFGA in compose + model push + staging | `docker-compose.dev.yml`, model-init job | OpenFGA healthy + model loaded; staging up |
| Tue | Tuple replay CLI + owner seed | `backend/src/scripts/fga-replay.ts` | Existing resources get `owner` tuples |
| Wed | Outbox writer wiring + cache invalidation | `workers/*`, `shared/services/authz/cache.ts` | Retry/DLQ; `fga:*:${resource}` purge |
| Thu | `check` benchmark harness | `backend/src/scripts/fga-bench.ts` | p95 cached < 20ms recorded |
| Fri | OpenFGA in CI + Trivy | `.github/workflows/ci.yml` | Authz integration job green; scans clean |

---

## Parallel work rules

### Can run in parallel
- Dev1 service wrapper + Dev3 OpenFGA compose (different files)
- Dev2 share dialog UI + Dev1 share endpoints (contract synced Mon)
- Dev3 benchmark + Dev1 public links

### Must sequence
- **Model frozen (Tue)** before tuple writers + FE relation names finalize
- `authorize()` middleware (Tue) before share endpoints assume gating (Wed)
- `fga_outbox` migration (Tue) before outbox writer worker (Wed)
- Owner-tuple seed (Tue) before `batchCheck` list filtering (Thu) — else lists come back empty

### Branch strategy
- Branches: `feat/p2-<task>`
- PRs ≤400 LOC, one reviewer, conventional commits
- Merge order: **Dev1 → Dev3 → Dev2** daily
- Hooks: full check suite runs at **commit** (lefthook); push is fast

---

## End-of-week deliverables (definition of done)

- [ ] OpenFGA running in compose; frozen model loaded via init job
- [ ] `AuthorizationService` (`check`/`write`/`batchCheck`) wrapping `@openfga/sdk`
- [ ] `authorize(relation)` + `loadResource()` middleware on file/folder routes; deny-by-default
- [ ] `fga_outbox` table + writer worker; tuples written in same tx as resource
- [ ] `POST/DELETE /files/:id/share` + `/folders/:id/share` (editor/viewer grant/revoke)
- [ ] Public link create/resolve/revoke via `public_link` tuples (`user:*` scoped through link)
- [ ] Redis permission cache (30s TTL) + pattern invalidation on tuple write
- [ ] `batchCheck` filters list endpoints to viewable items
- [ ] Share dialog (member picker, role select, public link) + permission-aware grid + 403 UX
- [ ] `check` p95 < 20ms cached (benchmark recorded)
- [ ] OpenAPI covers `/share` + `/links`; ≥4 new integration tests green
- [ ] OpenFGA in CI; Trivy clean on new deps

---

## Deferred (week 4+)

| Item | Why wait |
|---|---|
| Public-link password + expiry + view limits | Ship basic link first; harden next |
| Workspace / org / team management UI | Phase 3 — model is workspace-rooted but no UI yet |
| Activity / audit feed from outbox stream | Phase 3 — `audit_log` consumes same outbox |
| Permission-check circuit breaker + readiness gating | Phase 7 hardening |
| OpenFGA horizontal scale + cache cluster | Scaling phase |
| Bulk / recursive share (share whole subtree explicitly) | Inheritance covers common case; revisit on demand |

---

## Week 4 preview

| Dev | Focus |
|---|---|
| Dev1 | Workspace BE (create, invite, membership tuples); `audit_log` from outbox |
| Dev2 | Workspace switcher + invites UI; activity feed drawer |
| Dev3 | Event bus (Redis Streams) + activity/notification consumers |

---

## Related docs

- [Sprint Week 2](./sprint-week-2.md)
- [Execution roadmap](./roadmap.md) — Phase 2
- [OpenFGA model](./openfga-model.md)
- [Architecture](./architecture.md)
- [Database design](./database-design.md)
- [Rate limiting](./rate-limiting.md)
- [Environments](./environments.md)
