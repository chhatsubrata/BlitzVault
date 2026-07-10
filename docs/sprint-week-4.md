# BlitzVault — Sprint Week 4 (3 Developers)

> **Week:** Mon 16 Jun – Fri 20 Jun 2026
> **Based on:** repo state after Week 3 merge (Phase 2 complete)
> **Aligns with:** `docs/roadmap.md` Phase 3 — Workspaces, Activity, Notifications

> **Foundation from Week 3:** the `fga_outbox` transactional-outbox pattern and
> the OpenFGA workspace-rooted model are live. Phase 3 **reuses the same outbox
> stream** for the audit/activity log — do **not** add a second dual-write path.
> Workspace is the OpenFGA authorization root (`workspace` type already in the
> frozen model); this week makes it a real, switchable tenant boundary.

---

## Week goal

Turn the single-owner drive into a **team workspace**: users belong to a
workspace, can invite others, and switch between workspaces; every mutation
emits an event onto the bus that fans out to an **activity feed** and
**notifications** (in-app + email). Files/folders scope to `workspace_id`.

| By Friday EOD | Owner |
|---|---|
| Workspace entity + membership + invite endpoints (accept/revoke) | Dev1 |
| `audit_log` + activity events consumed from the outbox stream | Dev1 |
| Workspace switcher + invite UI + activity feed drawer + notification center | Dev2 |
| Event bus (Redis Streams) + activity/notification/email consumers | Dev3 |
| Email worker (Resend/Postmark) for invites + notification digests | Dev3 |
| Resource queries scoped to active `workspace_id` (no cross-tenant leak) | Dev1 + Dev2 |

---

## Phase focus this week

| Phase | Scope this week | Stretch (Fri only) |
|---|---|---|
| **Phase 3** — Workspaces / Activity / Notifications | **Primary (Mon–Fri)** | Notification preferences (per-type mute) |
| **Phase 4** — Search/Trash/Starred | Out of scope (activity log stays query-friendly for later feed replay) | — |

**Out of scope this week:** search, preview pane, versioning UI, realtime
presence, AI, command palette.

---

## Carry-over from Week 3 (fix early)

| Item | Why | Owner |
|---|---|---|
| Files/folders created without explicit `workspace_id` (implied single tenant) | multi-tenant queries need a real column + backfill | Dev1 (Mon) |
| Outbox writer only emits FGA tuples, not domain events | activity feed needs mutation events on the same stream | Dev1 (Tue) |
| No email transport configured | invites + notifications need a real sender | Dev3 (Mon) |

---

## Starting point (already in repo)

| Done (Week 1–3) | Gap (Week 4 fills) |
|---|---|
| OpenFGA model with `workspace`/`organization`/`team` types, `authorize()` mw | No workspace rows, no membership tuples written, no switcher |
| `fga_outbox` + writer worker draining to OpenFGA | Outbox carries tuples only; no `audit_log`, no event fan-out |
| Sharing (user + public link), permission-aware grid | No workspace-scoped listing; personal drive only |
| BullMQ workers (AV scan, outbox writer) | No Redis Streams event bus; no email worker |
| Redis rate-limit + permission cache | No notification store / unread counts |
| `features/{files,folders,sharing}` (BE + FE) | No `features/workspaces`, `features/activity`, `features/notifications` |

---

## Developer roles (fixed for the week)

| Dev | Focus | Owns |
|---|---|---|
| **Dev1** | Backend / tenancy | Workspace entity, membership, invites, `workspace_id` scoping, `audit_log` |
| **Dev2** | Frontend / UX | Workspace switcher, invite UI, activity feed drawer, notification center |
| **Dev3** | DevOps / events | Redis Streams bus, activity/notification consumers, email worker |

---

## Day-by-day overview

### Monday — Workspace entity + scoping + email transport

| Dev | Tasks | Output |
|---|---|---|
| **Dev1** | `Workspace` + `WorkspaceMember` entities + migration `0005`; add `workspace_id` to files/folders + backfill; personal "My Workspace" auto-created on `/auth/sync` | Every resource has a workspace; default workspace per user |
| **Dev2** | `features/workspaces` scaffold (`api/keys/types`); workspace switcher shell in topbar (list + active state) — live `/workspaces` query | Switcher renders user's workspaces |
| **Dev3** | Email transport (`Resend`/`Postmark`) behind `MailAdapter` env-selected; local dev routes to Mailpit; `EMAIL_*` env in `.env.example` + `environments.md` | Test email lands in Mailpit |

**15-min sync:** workspace key scheme, `workspace_id` in list responses, event envelope shape (`{ type, actor, workspace, resource, ts, meta }`).

---

### Tuesday — Invites + event bus

| Dev | Tasks | Output |
|---|---|---|
| **Dev1** | `POST /workspaces` (create), `POST /workspaces/:id/invites` (email → pending), `POST /invites/:token/accept`, `DELETE` revoke; writes `member` tuple via outbox on accept | Invite flow grants workspace access E2E |
| **Dev2** | Invite modal (email + role); pending-invites list; accept-invite landing page (`/invite/:token`) | Send + accept invite from UI |
| **Dev3** | Redis Streams bus (`shared/services/events/*`): `publish` + consumer-group `read`; outbox writer also publishes domain events onto the stream | Events flow onto bus; consumer group reads |

**30-min contract review:** Dev1 presents event envelope + invite Zod; Dev2 + Dev3 sign off. **No event-schema changes after Tue without ADR.**

---

### Wednesday — Activity log + feed

| Dev | Tasks | Output |
|---|---|---|
| **Dev1** | `audit_log` migration `0006` (append-only); activity consumer writes events → `audit_log`; `GET /workspaces/:id/activity` (cursor paginated, workspace-scoped, authz-gated) | Mutations produce queryable activity |
| **Dev2** | Activity feed drawer (right panel): grouped by day, actor avatar + verb + resource, infinite scroll; live-ish via polling/`refetchInterval` | Feed shows real workspace activity |
| **Dev3** | Activity consumer worker (Streams → `audit_log` write, idempotent by event id); dead-letter + replay for the consumer group | Activity consumer reliable + idempotent |

**Integration test (all):** user uploads file → event on bus → activity row written → shows in feed.

---

### Thursday — Notifications (in-app + email)

| Dev | Tasks | Output |
|---|---|---|
| **Dev1** | `Notification` entity + migration `0007`; `GET /notifications` (unread count, mark-read); notification consumer maps relevant events → per-user notifications | Users get notifications for shares/invites |
| **Dev2** | Notification center (bell + unread badge + dropdown list, mark-read/mark-all); toast on new in-session notification | Unread badge + list working |
| **Dev3** | Email consumer: invites (immediate) + notification digest (batched); templated via `MailAdapter`; retry/backoff + DLQ | Invite + digest emails sent via worker |

---

### Friday — Tests, buffer, demo

| Dev | Tasks | Output |
|---|---|---|
| **Dev1** | Integration tests: invite accept, workspace scoping (no cross-tenant leak), activity write, notification create; OpenAPI for workspaces/activity/notifications | ≥4 new passing tests; live docs |
| **Dev2** | Switcher/feed/notification polish; a11y (drawer focus, live-region for unread); mobile activity + notification sheets | Polished, accessible |
| **Dev3** | Event bus + email worker in CI (lint/typecheck + smoke against Redis); Mailpit assertion in integration job; Trivy clean on new deps | Events + email covered by CI |

**Demo (4pm):** A creates workspace → invites B → B accepts → A uploads +
shares file → activity feed shows both events → B gets in-app notification +
invite email in Mailpit → switch workspace shows isolated contents. CI green.

---

## Developer-wise detailed breakdown

### Dev1 — Backend / tenancy

| Day | Task | Files / areas | Acceptance |
|---|---|---|---|
| Mon | Workspace entities + scoping | `features/workspaces/*`, `migrations/0005_*`, files/folders repos | `workspace_id` on all resources; default WS |
| Tue | Invite endpoints + member tuple | `features/workspaces/{controller,service,schema}.ts` | Accept grants access via outbox tuple |
| Wed | `audit_log` + activity API | `migrations/0006_*`, `features/activity/*` | Append-only; cursor + authz-gated list |
| Thu | Notifications entity + API | `migrations/0007_*`, `features/notifications/*` | Unread count + mark-read |
| Fri | Tests + OpenAPI | `tests/integration/*`, `shared/openapi/*` | ≥4 new tests; tenant isolation proven |

**Note:** `audit_log` is append-only (no update/delete). Cross-tenant isolation enforced by `workspace_id` filter **and** OpenFGA `check` — defense in depth.

### Dev2 — Frontend / UX

| Day | Task | Files / areas | Acceptance |
|---|---|---|---|
| Mon | Workspace switcher | `features/workspaces/*`, topbar | Lists workspaces; active state |
| Tue | Invite UI + accept page | `features/workspaces/components/*`, `app/invite/[token]/page.tsx` | Send + accept invite |
| Wed | Activity feed drawer | `features/activity/*` | Grouped, infinite scroll |
| Thu | Notification center | `features/notifications/*` | Unread badge + mark-read |
| Fri | Polish + a11y + mobile | above features | WCAG AA; mobile sheets |

**Dependency:** Wed feed blocked until Dev1 activity API (Wed AM); Thu center blocked until notifications API (Thu AM).

### Dev3 — DevOps / events

| Day | Task | Files / areas | Acceptance |
|---|---|---|---|
| Mon | Email transport (`MailAdapter`) | `shared/services/mail/*`, `.env.example`, `environments.md` | Mailpit receives test send |
| Tue | Redis Streams bus | `shared/services/events/*`, outbox writer | Publish + consumer-group read |
| Wed | Activity consumer worker | `workers/activity/*` | Idempotent Streams → `audit_log` |
| Thu | Email consumer (invite + digest) | `workers/mail/*` | Retry/DLQ; templated sends |
| Fri | Bus + email in CI | `.github/workflows/ci.yml` | Smoke green; Mailpit assertion |

---

## Parallel work rules

### Can run in parallel
- Dev1 workspace entities + Dev3 event bus (different files)
- Dev2 switcher UI + Dev1 workspace endpoints (contract synced Mon)
- Dev3 email worker + Dev1 notifications API

### Must sequence
- `workspace_id` scoping (Mon) before any workspace-scoped list/feed
- **Event envelope frozen (Tue)** before consumers + FE feed rely on it
- Redis Streams bus (Tue) before activity/notification/email consumers (Wed–Thu)
- `audit_log` migration (Wed) before activity consumer writes
- Invite accept → member tuple (Tue) before switching into an invited workspace works

### Branch strategy
- Branches: `feat/p3-<task>`
- PRs ≤400 LOC, one reviewer, conventional commits
- Merge order: **Dev1 → Dev3 → Dev2** daily
- Hooks: full check suite runs at **commit** (lefthook); push is fast

---

## End-of-week deliverables (definition of done)

- [ ] `Workspace` + `WorkspaceMember` entities; every file/folder scoped to `workspace_id`
- [ ] Default personal workspace auto-created on `/auth/sync`
- [ ] Invite create / accept / revoke; membership written as OpenFGA tuple via outbox
- [ ] Workspace switcher isolates contents (no cross-tenant leak, test-proven)
- [ ] Redis Streams event bus; outbox writer publishes domain events
- [ ] `audit_log` (append-only) + `GET /workspaces/:id/activity` (cursor, authz-gated)
- [ ] Activity feed drawer on real events
- [ ] `Notification` entity + `GET /notifications` (unread + mark-read); notification center UI
- [ ] Email worker (Resend/Postmark via `MailAdapter`): invites + digests; Mailpit in dev
- [ ] Consumers idempotent (by event id) + DLQ/replay
- [ ] OpenAPI covers workspaces/activity/notifications; ≥4 new integration tests green
- [ ] Event bus + email worker in CI; Trivy clean on new deps

---

## Deferred (week 5+)

| Item | Why wait |
|---|---|
| Notification preferences / per-type mute | Ship defaults first |
| Activity replay / time-travel UI | Phase 4 — needs feed stable |
| Org/team hierarchy management UI | Model supports it; UI later |
| Realtime feed via WebSocket (vs polling) | Phase 5 — presence infra |
| Email digest scheduling/cron tuning | After basic send proven |
| Cross-workspace move of files | Rare; design carefully post-MVP |

---

## Week 5 preview

| Dev | Focus |
|---|---|
| Dev1 | Trash/restore + file versioning BE; Postgres FTS (filename/metadata) |
| Dev2 | Preview pane (PDF/img), search UI, command palette (⌘K), starred |
| Dev3 | FTS indexer worker; thumbnail pipeline hardening; realtime spike |

---

## Related docs

- [Sprint Week 3](./sprint-week-3.md)
- [Execution roadmap](./roadmap.md) — Phase 3
- [OpenFGA model](./openfga-model.md)
- [Architecture](./architecture.md)
- [Database design](./database-design.md)
- [Environments](./environments.md)
