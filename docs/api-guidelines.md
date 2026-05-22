# API Guidelines

> **Week 1 transitional state:** Existing auth/users routes still return `{ success, message, data? }` until the centralized error handler lands (Tuesday). Target envelopes below are authoritative for new work. See [`contracts-week1-monday.md`](./contracts-week1-monday.md).

## Conventions

- **Versioning**: all routes under `/api/v1`. Bump to `/v2` only on breaking change; never silently break v1.
- **Naming**: resources plural (`/files`, `/folders`), kebab-case for multi-word (`/share-links`).
- **Methods**:
  - `GET` — list / read, never mutates.
  - `POST` — create, or non-CRUD actions (`/files/:id/restore`).
  - `PATCH` — partial update.
  - `PUT` — full replace (rare; prefer PATCH).
  - `DELETE` — soft delete by default; hard delete via `?hard=true` admin-only.
- **Status codes**:
  - `200` read, `201` create, `204` empty success.
  - `400` validation, `401` no/invalid JWT, `403` authz denied, `404` not found OR no read access (avoid existence leak), `409` conflict (name dupe), `422` semantic invalid, `429` rate limit, `500` server.

## Request shape

- JSON only. `Content-Type: application/json` required for body.
- Auth header: `Authorization: Bearer <clerk-jwt>`.
- Idempotency: mutating endpoints accept optional `Idempotency-Key` header. Required for `/files/upload/init`.
- Correlation: server echoes `X-Request-Id`; client may send one.

## Response shape

Success:
```json
{ "data": { ... }, "meta": { ... optional ... } }
```

List:
```json
{
  "data": [ ... ],
  "meta": { "nextCursor": "abc123", "limit": 50 }
}
```

Error (centralized):
```json
{
  "error": {
    "code": "FILE_NOT_FOUND",
    "message": "Human readable",
    "details": [ { "path": "name", "issue": "too_short" } ],
    "requestId": "req_..."
  }
}
```

Never leak stack traces, SQL fragments, or internal IDs outside the response envelope.

## Pagination

- **Cursor-based** for all lists. No offset pagination — breaks at scale.
- Request: `?cursor=<opaque>&limit=50` (max 100).
- Response: `meta.nextCursor` (null when done).
- Cursors opaque base64 of `{lastId, lastSortKey}`. Stable across reorder by tiebreaking on `id`.

## Filtering / sorting

- `?sort=name|created_at|size`, `-prefix` for desc (`?sort=-created_at`).
- `?filter[mime]=image/*&filter[owner]=me` — bracket notation.
- `?q=` reserved for search.

## Validation

- Zod at boundary via `validateRequest({ body, params, query })`.
- Same schema re-exported to FE for symmetric checks.
- Reject unknown keys (`strict()`).

## Auth

- Every route except `/auth/*` and `/healthz` requires Clerk JWT.
- Authorization (OpenFGA) layered **after** authentication via `authorize(relation)` middleware.
- 401 means "not authenticated"; 403 means "authenticated but denied".

## Rate limiting

| Endpoint class | Limit |
|---|---|
| `/auth/*` | 10 / min / IP |
| `/files/upload/*` | 60 / min / user |
| `/share/*` | 30 / min / user |
| Read endpoints | 600 / min / user |
| AI endpoints | 30 / min / user |

Limits per environment via config. Headers: `X-RateLimit-Remaining`, `Retry-After`.

## Caching

- `Cache-Control: private, max-age=0, must-revalidate` default.
- Public assets via CDN.
- `ETag` on file metadata reads.

## Errors — typed codes

| Code | HTTP | Meaning |
|---|---|---|
| `UNAUTHENTICATED` | 401 | Missing/invalid JWT |
| `FORBIDDEN` | 403 | OpenFGA denied |
| `NOT_FOUND` | 404 | Resource missing OR no read access |
| `VALIDATION` | 400 | Zod failure |
| `CONFLICT` | 409 | Duplicate name in folder |
| `QUOTA_EXCEEDED` | 422 | Workspace storage cap |
| `RATE_LIMITED` | 429 | Hit rate limit |
| `UPSTREAM` | 502 | S3/OpenFGA/LLM failed |
| `INTERNAL` | 500 | Unhandled |

## Versioning policy

- Breaking change → new path version.
- Additive change (new optional field) → no version bump.
- Deprecated fields marked in OpenAPI + `Sunset` header.

## OpenAPI

- Generated from Zod schemas via `zod-to-openapi`.
- Served at `/api/v1/openapi.json` (gated to authed users in prod).
- Stoplight / Swagger UI at `/api/docs` in non-prod only.

## Webhooks (future)

- Outbound: signed HMAC `X-BlitzVault-Signature`, replay-protected via timestamp.
- Inbound: Clerk webhook → `/api/v1/webhooks/clerk` with svix signature verification.
