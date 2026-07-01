# BlitzVault — Sprint Week 2 (3 Developers)

> **Week:** Mon 2 Jun – Fri 6 Jun 2026
> **Based on:** repo state after Week 1 merge (Phase 0 complete)
> **Aligns with:** `docs/roadmap.md` Phase 1 — Core File System

> **Decision (Wed, mid-sprint):** thumbnails ship via **Cloudinary on-delivery
> URL transforms** (`getThumbnailUrl` in `features/files/files.mapper.ts`), **not**
> a BullMQ worker. No job queue, no stored thumbnail asset, no `thumbnail_key`
> column — the derived URL is built per response. This also removes the need for
> MinIO/S3 this phase (Cloudinary is the Phase 1 store). The BullMQ thumbnail
> worker is deferred (see **Deferred** below). Tasks below are updated to match.

---

## Week goal

Ship a **working drive**: upload a file to object storage and see it (with a
thumbnail) in the grid; create/rename/move/delete folders. Persisted in
Postgres + S3/R2 (MinIO locally). No sharing/permissions yet.

| By Friday EOD | Owner |
|---|---|
| `StorageAdapter` impl (S3/R2) + presigned upload/download | Dev1 |
| `POST /files/upload/init` + `/complete`; folder CRUD endpoints | Dev1 |
| File grid wired to real API; uploader with progress; optimistic rename/delete | Dev2 |
| Cloudinary storage wired; thumbnails on-delivery (no worker); upload rate limits | Dev3 |
| Contract: upload init/complete + folder CRUD frozen (Tue) | Dev1 + Dev2 |

---

## Phase focus this week

| Phase | Scope this week | Stretch (Fri only) |
|---|---|---|
| **Phase 1** — Core file system | **Primary (Mon–Fri)** | Resumable/multipart upload spike |
| **Phase 2** — Authorization | Out of scope (entities only must stay FGA-ready) | — |

**Out of scope this week:** OpenFGA, sharing, workspaces, realtime, AI, search,
file versioning UI.

---

## Carry-over from Week 1 (fix early)

| Item | Why | Owner |
|---|---|---|
| `node dist/server.js` start broken (TypeORM `.ts` migration glob) | blocks real/prod start; only `ts-node` dev works | Dev1 (Mon) |
| Trivy `@master` unpinned | reproducibility — pin to the tag the green run used | Dev3 (Mon) |
| Staging not provisioned | needed before Phase 1 can be demoed off-localhost | Dev3 (stretch) |

---

## Starting point (already in repo)

| Done (Week 1) | Gap (Week 2 fills) |
|---|---|
| `Files` + `Folders` entities + migration `0003` | No file/folder write endpoints (folders = list only) |
| `StorageAdapter` **interface** (`shared/services/storage.adapter.ts`) | No concrete adapter (throws "not implemented") |
| `fileUploadInitSchema`, `folderCreate/List` Zod | No upload complete / folder mutate schemas |
| Drive grid + empty state + card + `useDriveList` (mock data) | Not wired to real API; no uploader |
| BullMQ demo worker spike (`workers/index.ts`) | Thumbnails via Cloudinary on-delivery transform (no worker); processing-worker pool deferred |
| Redis rate limit (`strict`/`default` tiers) | No `write` tier applied to uploads |
| Redis + Mailpit in compose | No MinIO (local S3) |

---

## Developer roles (fixed for the week)

| Dev | Focus | Owns |
|---|---|---|
| **Dev1** | Backend / storage | Storage adapter, upload endpoints, folder CRUD, file service |
| **Dev2** | Frontend / UX | File grid (real data), uploader + progress, optimistic mutations |
| **Dev3** | DevOps / storage | Cloudinary delivery, upload rate limits, CI |

---

## Day-by-day overview

### Monday — Storage adapter + carry-overs

| Dev | Tasks | Output |
|---|---|---|
| **Dev1** | Implement `S3Adapter` (presigned PUT/GET, delete) behind `StorageAdapter`; `createStorageAdapter()` selects via env (`STORAGE_DRIVER`); fix `node dist` start | Adapter unit-tested against MinIO |
| **Dev2** | Replace drive mock with real `useDriveList` query against `/folders`; loading/empty/error states real | Grid renders live (empty) data |
| **Dev3** | ~~Add MinIO to `docker-compose.dev.yml` (+ bucket bootstrap)~~ **deferred (Cloudinary chosen)**; pin Trivy action tag (`@v0.36.0`); Cloudinary storage env vars in `.env.example` + `environments.md` | Trivy pinned; storage env documented |

**15-min sync:** storage key scheme (`workspaces/{ws}/files/{fileId}`), env var names.

---

### Tuesday — Upload contract freeze + endpoints

| Dev | Tasks | Output |
|---|---|---|
| **Dev1** | `POST /files/upload/init` (presigned PUT + idempotency key) and `/complete` (verify ETag/checksum → write `File` row); export Zod for both | **Frozen upload contract** |
| **Dev2** | Uploader component: pick file → call `init` → PUT to presigned URL with XHR progress → `complete`; optimistic row in grid | Single file uploads E2E |
| **Dev3** | `write` rate-limit tier on `/files/upload/*`; Cloudinary signed-upload params for browser POST | Uploads throttled; browser direct upload works |

**30-min contract review:** Dev1 presents init/complete; Dev2 + Dev3 sign off.
**No upload schema changes after Tue without ADR.**

---

### Wednesday — Folder CRUD + grid actions

| Dev | Tasks | Output |
|---|---|---|
| **Dev1** | Folder `create` / `rename` / `move` / soft-delete (`deleted_at`) endpoints; cursor pagination on list; validate move (no cycles) | Folder tree mutable via API |
| **Dev2** | Create-folder modal; rename/delete with optimistic update + rollback on error; breadcrumb navigation into folders | Folder ops feel instant |
| **Dev3** | Thumbnails via Cloudinary on-delivery transform (`getThumbnailUrl` in `files.mapper`) — no enqueue, no stored asset, no `thumbnail_key` | Image + PDF uploads get thumbnails |

**Integration test (all):** upload image → appears in grid → thumbnail renders.

---

### Thursday — Download, delete, polish

| Dev | Tasks | Output |
|---|---|---|
| **Dev1** | `GET /files/:id/download` (presigned GET); file soft-delete + restore stub; list files within a folder | Download works; files listable |
| **Dev2** | Download action; file/folder context menu (rename/move/delete/download); drag-to-upload zone | Full grid interactions |
| **Dev3** | Worker in CI (lint/typecheck); MinIO service in upload integration test job; AV-scan stub job | Workers covered by CI |

---

### Friday — Tests, buffer, demo

| Dev | Tasks | Output |
|---|---|---|
| **Dev1** | Integration tests: upload init/complete, folder CRUD (against MinIO + PG); OpenAPI docs updated for new endpoints | Green tests; live docs |
| **Dev2** | Empty/error/skeleton polish; a11y on uploader + menus; mobile grid | Polished drive |
| **Dev3** | Trivy scan still clean (new deps); Cloudinary thumbnail URL covered by mapper/integration test; deploy/staging doc update | Security + infra green |

**Demo (4pm):** upload image → thumbnail in grid → rename folder → move file →
download → delete. CI green.

---

## Developer-wise detailed breakdown

### Dev1 — Backend / storage

| Day | Task | Files / areas | Acceptance |
|---|---|---|---|
| Mon | S3/R2 adapter | `shared/services/storage/*` | Presigned PUT/GET work vs MinIO |
| Mon | Fix dist start | `server.ts`, `config/db.ts` migrations glob | `node dist/server.js` boots |
| Tue | Upload init/complete | `features/files/{controller,service,routes,schema}` | Row written only after ETag verify |
| Wed | Folder CRUD | `features/folders/*` | create/rename/move/soft-delete + cursor list |
| Thu | Download + file list | `features/files/*` | Presigned GET; list by folder |
| Fri | Tests + OpenAPI | `tests/integration/*`, `shared/openapi/*` | ≥3 new passing tests; docs match |

### Dev2 — Frontend / UX

| Day | Task | Files / areas | Acceptance |
|---|---|---|---|
| Mon | Real list query | `features/drive/{api,hooks}` | Live data, no mock |
| Tue | Uploader + progress | `features/drive/components/uploader.tsx` | XHR progress %, error handling |
| Wed | Folder ops optimistic | `features/drive/*`, React Query mutations | Optimistic + rollback |
| Thu | Context menu + download + DnD | `features/drive/components/*` | All actions wired |
| Fri | Polish + a11y + mobile | drive components | WCAG AA; responsive grid |

### Dev3 — DevOps / workers

| Day | Task | Files / areas | Acceptance |
|---|---|---|---|
| Mon | ~~MinIO in compose~~ → Pin Trivy + Cloudinary storage env docs | `ci.yml`, `environments.md`, `.env.example` | Trivy pinned `@v0.36.0`; storage env documented (MinIO deferred) |
| Tue | Upload rate limits + bucket CORS | `shared/middleware/rate-limit.ts` (`write`) | `/files/upload/*` throttled |
| Wed | Thumbnails (Cloudinary on-delivery) | `shared/services/storage/cloudinary.adapter.ts` (`getThumbnailUrl`), `features/files/files.mapper.ts` | Image + PDF get derived thumbnail URLs |
| Thu | Worker CI + AV stub | `.github/workflows/ci.yml` | Worker lint/typecheck + smoke |
| Fri | Trivy + staging doc | CI, `docs/environments.md` | Scans clean; storage env documented |

---

## Parallel work rules

### Can run in parallel
- Dev1 adapter + Dev3 MinIO (different files)
- Dev2 uploader UI + Dev1 endpoints (contract frozen Tue)
- Dev3 worker + Dev1 file service

### Must sequence
- Upload contract (Tue) before FE uploader finalizes
- `File` row write (`/complete`) before the grid maps its thumbnail URL
- MinIO + bucket CORS before browser direct-PUT works

### Branch strategy
- Branches: `feat/p1-<task>`
- PRs ≤400 LOC, one reviewer, conventional commits
- Merge order: **Dev1 → Dev3 → Dev2** daily
- Hooks: full check suite runs at **commit** (lefthook); push is fast

---

## End-of-week deliverables (definition of done)

- [ ] `StorageAdapter` concrete impl (S3/R2) selected via env; works vs MinIO
- [ ] `POST /files/upload/init` + `/complete` (idempotent, ETag/checksum verified)
- [ ] Folder create / rename / move / soft-delete + cursor list
- [ ] `GET /files/:id/download` presigned
- [ ] File grid on real data; uploader with progress; optimistic rename/delete
- [ ] Thumbnails derived on delivery (Cloudinary transform) for images + PDFs
- [ ] `write` rate-limit tier on upload routes
- [ ] Cloudinary storage wired; storage env documented (`environments.md`)
- [ ] OpenAPI docs cover new endpoints; ≥3 new integration tests green
- [ ] `node dist/server.js` start fixed
- [ ] CI green incl. Trivy on new deps

---

## Deferred (week 3+)

| Item | Why wait |
|---|---|
| MinIO in compose + bucket bootstrap | **Cloudinary** chosen for Phase 1 storage; revisit when an S3/R2 driver lands |
| BullMQ thumbnail / processing worker | Cloudinary on-delivery transforms cover Phase 1; revisit for video keyframes / offline processing |
| OpenFGA / sharing / permissions | Phase 2 — needs R&D spike |
| Workspaces (multi-tenant) | Phase 3 |
| File versioning UI | After core CRUD stable |
| Resumable / multipart upload | Optimize after single-file works |
| Search (pg_trgm / vector) | Phase 6 |

---

## Week 3 preview

| Dev | Focus |
|---|---|
| Dev1 | OpenFGA service + `authorize()` middleware; `fga_outbox` transactional writes |
| Dev2 | Share UI (member picker, link sharing), permission-aware grid |
| Dev3 | OpenFGA in compose; tuple migration tool; permission-check cache (Redis) |

---

## Related docs

- [Sprint Week 1](./sprint-week-1.md)
- [Execution roadmap](./roadmap.md) — Phase 1
- [Architecture](./architecture.md)
- [Database design](./database-design.md)
- [Rate limiting](./rate-limiting.md)
- [Environments](./environments.md)
