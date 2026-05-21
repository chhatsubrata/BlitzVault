# OpenFGA Model

## Why OpenFGA

Drive-style sharing demands relationship-based access (ReBAC), not roles-in-rows. OpenFGA is a production Zanzibar implementation: fine-grained, hierarchical, sub-10ms `check` with caching. Native fit for folder-tree inheritance, sharing, public links, multi-tenant orgs.

Rejected alternatives:
- **RBAC**: explodes on per-file sharing.
- **ABAC**: slow + opaque at file granularity.
- **Bespoke ReBAC**: reinvents Zanzibar; cache + consistency hard.

## Authorization model (DSL)

```
model
  schema 1.1

type user

type organization
  relations
    define member: [user]
    define admin:  [user]
    define owner:  [user]
    define can_administer: owner or admin
    define can_view:       member or can_administer

type team
  relations
    define organization: [organization]
    define member:       [user] or member from organization
    define admin:        [user] or admin from organization

type workspace
  relations
    define organization: [organization]
    define owner:        [user]
    define admin:        [user] or admin from organization
    define member:       [user, team#member] or admin
    define viewer:       [user, team#member]
    define can_create_folder: admin or member
    define can_administer:    owner or admin

type folder
  relations
    define parent:  [folder, workspace]
    define owner:   [user]
    define editor:  [user, team#member, public_link] or editor from parent
    define viewer:  [user, team#member, public_link] or viewer from parent or editor
    define can_read:  viewer or editor or owner
    define can_write: editor or owner
    define can_share: owner or editor

type file
  relations
    define parent:  [folder]
    define owner:   [user]
    define editor:  [user, team#member, public_link] or editor from parent
    define viewer:  [user, team#member, public_link] or viewer from parent or editor
    define can_read:  viewer or editor or owner
    define can_write: editor or owner
    define can_share: owner or editor
    define can_delete: owner or editor

type public_link
  relations
    define resource: [file, folder]
    define accessor: [user, user:*]
```

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

- OpenFGA in `docker-compose.dev.yml` with Postgres-backed store.
- Init job loads model from `backend/src/authz/model.fga` on boot.
- `fga` CLI for ad-hoc tuple inspection.

## Testing

- Unit: mock OpenFGA SDK in services.
- Integration: real OpenFGA testcontainer; load model; seed tuples; assert checks.
- Permission matrix test: table-driven, every (role × action × resource depth) combo.

## Audit

- Every `write` / `delete` mirrored to `audit_log` with actor, target, timestamp.
- `check` results NOT logged by default (volume); sample 0.1% in prod for anomaly detection.
