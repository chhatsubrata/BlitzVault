# OpenFGA Model

## Why OpenFGA

Drive-style sharing demands relationship-based access (ReBAC), not roles-in-rows. OpenFGA is a production Zanzibar implementation: fine-grained, hierarchical, sub-10ms `check` with caching. Native fit for folder-tree inheritance, sharing, public links, multi-tenant orgs.

Rejected alternatives:
- **RBAC**: explodes on per-file sharing.
- **ABAC**: slow + opaque at file granularity.
- **Bespoke ReBAC**: reinvents Zanzibar; cache + consistency hard.

## Authorization model

**Source of truth: [`backend/src/authz/model.fga`](../backend/src/authz/model.fga).**
This doc no longer duplicates the DSL — a copy here is how two defects drifted in
unnoticed (see *Changes* below). `pnpm fga:init` pushes that file; Tuesday's
model-lock review freezes that file.

Types, `schema 1.1`:

| Type | Relations | Notes |
|---|---|---|
| `user` | — | subject only |
| `organization` | `member`, `admin`, `owner` → `can_administer`, `can_view` | tenant root |
| `team` | `organization`, `member`, `admin` (inherit from org) | `team#member` grantable on resources |
| `workspace` | `organization`, `owner`, `admin`, `member`, `viewer` → `can_create_folder`, `can_administer` | Phase 3 |
| `folder` | `parent: [folder, workspace]`, `owner`, `editor`, `viewer` → `can_read`, `can_write`, `can_share`, `can_delete` | `editor`/`viewer` inherit `from parent` |
| `file` | `parent: [folder]`, `owner`, `editor`, `viewer` → `can_read`, `can_write`, `can_share`, `can_delete` | same shape as folder |
| `public_link` | `resource: [file, folder]`, `accessor: [user, user:*]` | grantable only as `public_link#accessor` |

`editor` and `viewer` on `folder`/`file` accept `[user, team#member, public_link#accessor]`.
Owner is implicit — never listed as a share grant.

### Changes — 2026-09-14 (Week 3 Mon, pre-freeze)

- `public_link` → `public_link#accessor` in every `editor`/`viewer` type
  restriction. The tuple examples below always wrote the `#accessor` userset;
  the old restriction would have rejected them.
- `folder` gains `can_delete: owner or editor`, matching `file`. Without it,
  `authorize('can_delete')` on `DELETE /folders/:id` denies everything.

**For the Tuesday review, unchanged today:** `editor from parent` resolves to
nothing when the parent is a `workspace` (no `workspace.editor`), so workspace
members currently get no folder access via inheritance. Validates fine — it is a
semantic gap, not a syntax one.

## Tuple examples

```
# User owns a workspace
write (workspace:ws_personal_alice#owner, user:alice)

# Team added as editor on folder
write (folder:f_marketing#editor, team:t_marketing#member)

# Public link making file viewable to anyone
write (public_link:pl_abc123#accessor, user:*)
write (file:fi_logo#viewer, public_link:pl_abc123#accessor)

# Bob has editor access on a specific subfolder (overrides parent)
write (folder:f_marketing_drafts#editor, user:bob)
```

## Inheritance behavior

- `folder.viewer` inherits from `parent` (which is either folder or workspace).
- `file.viewer` inherits from its parent folder.
- Result: granting viewer on root folder propagates down with **zero** additional tuples.
- Override: grant editor on deeper node — additive, never strips inherited.

## Tuple write strategy — transactional outbox

Never dual-write (DB + OpenFGA) directly:

```ts
await dataSource.transaction(async (em) => {
  const folder = await em.save(Folder, { ... });
  await em.save(FgaOutbox, {
    op: 'write',
    tuple: { user: `user:${ownerId}`, relation: 'owner', object: `folder:${folder.id}` },
  });
  await em.save(FgaOutbox, {
    op: 'write',
    tuple: { user: `workspace:${wsId}`, relation: 'parent', object: `folder:${folder.id}` },
  });
});
// Worker drains fga_outbox → calls fga.write([...]) in batches
```

Worker idempotent: OpenFGA `write` rejects duplicates → mark `done`.

## Move semantics

Move folder = update **one** `parent` tuple. Inheritance handles the rest. No fan-out across descendants.

```ts
// Old: parent = folder:source
// New: parent = folder:dest
await fga.write({
  deletes: [{ user: 'folder:source', relation: 'parent', object: 'folder:moved' }],
  writes:  [{ user: 'folder:dest',   relation: 'parent', object: 'folder:moved' }],
});
```

## Permission check pattern

```ts
async function authorize(userId: string, relation: string, object: string): Promise<boolean> {
  const key = `fga:${userId}:${relation}:${object}`;
  const hit = await redis.get(key);
  if (hit !== null) return hit === '1';

  const { allowed } = await fga.check({
    user: `user:${userId}`,
    relation,
    object,
  });
  await redis.setex(key, 30, allowed ? '1' : '0');
  return allowed;
}
```

- TTL 30s.
- On tuple write: invalidate by pattern `fga:*:*:<object>` (or `fga:<user>:*:*` for user-scoped grants).
- For list endpoints use `batchCheck` to avoid N round-trips.

## Middleware

```ts
router.get(
  '/api/v1/files/:id',
  requireClerkAuth,
  loadResource('file'),     // attaches req.resource
  authorize('can_read'),    // calls authzService against req.auth + req.resource
  filesController.get,
);
```

`authorize(relation)` returns 403 with `FORBIDDEN` code on deny; never reveals existence (404 → 403 distinction handled at controller for sensitivity).

## Public link mechanics

1. Owner creates link → `share_links` row + tuples:
   ```
   write (public_link:<id>#resource, file:<file_id>)
   write (file:<file_id>#viewer, public_link:<id>#accessor)
   write (public_link:<id>#accessor, user:*)
   ```
2. Anonymous request with `?token=...` → backend resolves token → injects synthetic `user:anon_<id>` (or uses `user:*` directly) → check `file#viewer`.
3. Revoke: delete tuples + soft-mark `share_links.revoked_at`.

## Admin override

Modeled as `admin` relation, not bypass code. Workspace admins inherit edit/view on all resources via:

- Add `or admin from workspace` to `folder.editor` (if desired) — or keep admin separate to avoid surprise inheritance.
- Decision: **admin does NOT auto-inherit file/folder edit**. Admins use explicit "view as admin" UI that writes a temporary tuple, audit-logged. Prevents silent admin reads.

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| OpenFGA cluster down | Deny-by-default writes; cache-served reads if hot; readiness probe drops from LB |
| Tuple drift vs DB | Outbox replay tool, daily reconciliation job |
| Cache stale after grant | Pattern invalidation on tuple write; TTL ≤ 30s ceiling |
| Public link abuse | Short tokens 256-bit + optional password + expiry + rate limit |
| `user:*` over-grant | Always behind `public_link` intermediate, never direct |
| Move fan-out | Single `parent` tuple change; inheritance handles |

## Performance targets

- `check` p95 < 20ms cached, < 80ms cold.
- `batchCheck` (50 items) p95 < 120ms.
- `write` p95 < 100ms.
- Outbox drain lag p95 < 2s.

## Local dev

Three compose services, in order (`docker-compose.dev.yml`):

| Service | Kind | Does |
|---|---|---|
| `openfga-db` | one-shot | creates the dedicated `openfga` database if absent |
| `openfga-migrate` | one-shot | OpenFGA's **own** schema (goose) — not the model |
| `openfga` | `openfga/openfga:v1.20.0` | HTTP `:8080`, gRPC `:8081`, healthcheck via `grpc_health_probe` |

OpenFGA gets its own database, not `blitz_vault`: TypeORM runs `synchronize` in
dev, and no test teardown should ever be able to wipe the authorization store.
Playground is off (port 3000 collides with Next.js; OpenFGA deprecates it).

The model is pushed from the host, mirroring how `pnpm migration:run` works:

```bash
docker compose -f docker-compose.dev.yml up -d
cd backend && pnpm fga:init --write-env   # store + model; fills FGA_* in .env.local
pnpm fga:smoke                            # write owner tuple → check → cleanup
```

`fga:init` is idempotent — finds the store by name, writes the model only if
`model.fga` differs from what the server has (every write mints a new
`FGA_MODEL_ID`, and the API pins it at boot, so restart after a change).
`docker compose down -v` wipes the store; the next `fga:init` yields new ids.

Inspect without the playground:

```bash
curl -s localhost:8080/stores
docker run --rm --network blitzvault-dev_default openfga/cli:v0.7.20 \
  --api-url http://openfga:8080 store list
docker run --rm -v "$PWD/backend/src/authz:/m:ro" openfga/cli:v0.7.20 \
  model validate --file /m/model.fga
```

## Testing

- Unit: mock OpenFGA SDK in services.
- Integration: real OpenFGA testcontainer; load model; seed tuples; assert checks.
- Permission matrix test: table-driven, every (role × action × resource depth) combo.

## Audit

- Every `write` / `delete` mirrored to `audit_log` with actor, target, timestamp.
- `check` results NOT logged by default (volume); sample 0.1% in prod for anomaly detection.
