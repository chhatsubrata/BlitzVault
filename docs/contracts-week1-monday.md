# Week 1 Monday — API contracts (Dev1 / Dev2 / Dev3)

Frozen at kickoff sync. Changes after Monday require Dev1 + Dev2 + Dev3 agreement.

## API base URL

| Layer | Variable | Local default |
|-------|----------|---------------|
| Frontend | `NEXT_PUBLIC_BACKEND_URL` | `http://localhost:5001` |
| Backend | `PORT` (from Zod env) | `5001` |
| Path prefix | — | `/api/v1` |

**URL construction (frontend):**

```typescript
const base = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:5001";
const url = `${base}/api/v1/auth/sync`;
```

Reference: [`frontend/app/auth-sync.tsx`](../frontend/app/auth-sync.tsx).

## Auth header

| Field | Value |
|-------|--------|
| Header | `Authorization: Bearer <clerk-session-jwt>` |
| Frontend | `await getToken()` from `@clerk/nextjs` |
| Backend | [`requireAuth`](../backend/src/middleware/requireAuth.ts) sets `req.auth.clerkUserId`, optional `sessionId`, `token` |

**Public (no JWT):** `POST /api/v1/auth/signup`, `POST /api/v1/auth/signin/password`, deprecated Google routes.

**Protected (JWT required):** `POST /api/v1/auth/sync`, all `/api/v1/users/*`.

## Response envelopes

### Target (authoritative — [`api-guidelines.md`](./api-guidelines.md))

Success:

```json
{ "data": { }, "meta": { } }
```

Error:

```json
{
  "error": {
    "code": "VALIDATION",
    "message": "Human readable",
    "details": [{ "path": "email", "issue": "invalid_string" }],
    "requestId": "req_..."
  }
}
```

### Transitional (existing routes until Tuesday error handler)

```json
{ "success": true, "message": "...", "data": { } }
```

```json
{ "success": false, "message": "...", "errors": ["..."] }
```

**Agreement:**

1. Dev2 `lib/fetcher.ts` parses the **target** `error` shape and throws `ApiError` (`code`, `message`, `status`, `requestId`).
2. Dev1 ships centralized `errorHandler` on **Tuesday**; legacy shape remains on current auth/users routes until then.
3. **New** endpoints after Thursday contract freeze use target shape only.
4. Error codes: see [`api-guidelines.md`](./api-guidelines.md) (e.g. `UNAUTHENTICATED`, `VALIDATION`, `NOT_FOUND`).

## Database (Dev3 compose alignment)

| Env var | Compose default |
|---------|-----------------|
| `DB_HOST` | `127.0.0.1` |
| `DB_PORT` | `5432` |
| `DB_USERNAME` | `postgres` |
| `DB_PASSWORD` | `postgres` |
| `DB_DATABASE` | `drive_clone` |

Schema changes: `pnpm migration:run` in `backend/` (no `synchronize` outside `NODE_ENV=development`).
