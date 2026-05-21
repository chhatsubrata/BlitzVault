# Auth Architecture

## Split of responsibility

- **Authentication** → Clerk. Identity, sessions, MFA, SSO, OAuth, email verification.
- **Authorization** → OpenFGA. Who-can-do-what on which resource.
- **Local user mirror** → Postgres `users` table. Joins, foreign keys, search.

Clear separation: Clerk never knows about files/folders; OpenFGA never knows about passwords.

## Auth flow (sign-up)

1. User opens `/signup` → Clerk modal (FE-owned).
2. Clerk handles email + password + verification code.
3. On success, FE has Clerk session JWT.
4. FE `AuthSync` component calls backend `POST /api/v1/auth/sync` with JWT.
5. Backend `verifyToken` → upsert into `users` (clerk_user_id, email, username, avatar).
6. Backend creates personal workspace + writes OpenFGA tuples `(workspace#owner, user)`, `(workspace#member, user)`.
7. Returns mirrored user → FE caches.

## Auth flow (sign-in)

1. User opens `/signin` → Clerk modal.
2. Clerk authenticates → session JWT.
3. FE attaches `Authorization: Bearer <jwt>` on every API call.
4. Optionally re-sync if email/avatar changed (debounced).

## SSO / OAuth

- Clerk handles Google / GitHub / Microsoft providers.
- Frontend SDK owns the flow. Backend Google OAuth route in current code is **deprecated** — remove Phase 0.
- Callback: `/sso-callback` → existing page.

## Token verification (backend)

```ts
import { verifyToken } from '@clerk/backend';

export const requireClerkAuth: RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new AuthnError();
  const token = header.slice(7);
  const payload = await verifyToken(token, {
    secretKey: env.CLERK_SECRET_KEY,
    authorizedParties: env.CLERK_AUTHORIZED_PARTIES,
  });
  req.auth = {
    userId: payload.sub,
    sessionId: payload.sid,
    orgId: payload.org_id ?? null,
  };
  next();
};
```

- Verifies signature, expiry, issuer, audience.
- Resolves local user via `clerk_user_id` lookup, cached 60s.
- Rejects on missing claims.

Replaces current static `AUTH_BEARER_TOKEN` middleware (P0 task).

## Webhooks (Clerk → BE)

- Endpoint: `POST /api/v1/webhooks/clerk` with svix signature verify.
- Handles: `user.created`, `user.updated`, `user.deleted`, `session.created`.
- On `user.updated` → update local mirror.
- On `user.deleted` → soft-tombstone local user (preserve audit), revoke active share tokens, schedule GDPR purge job.

## Authorization (OpenFGA) overview

See `openfga-model.md` for full model. Summary:

- Every resource access goes through `authorize(relation)` middleware.
- Middleware: `requireClerkAuth` → `loadResource` → `authorize` → controller.
- `authorize` calls OpenFGA `check({ user, relation, object })`, cached 30s in Redis.
- Tuple writes go through `fga_outbox` table in same DB transaction as resource mutation.

## Session lifecycle

- JWT lifetime: short (Clerk default 60s).
- Refresh: Clerk SDK rotates silently.
- Logout: FE calls Clerk `signOut()` → BE no-op (stateless).
- Forced sign-out: revoke session in Clerk dashboard or via API.

## Multi-tenancy

- Org / workspace concept lives in our DB + OpenFGA.
- Clerk Organizations may be used optionally for SSO-org alignment Phase 3+.
- JWT carries `org_id` claim when within an org context; backend honors as default tenant scope.

## Public links

- Token-based, not Clerk-authenticated.
- `share_links` table stores token, permission, expiry, optional password.
- On access: backend resolves token → maps to OpenFGA `public_link` object → check viewer relation.
- Anonymous users: tuple `(public_link#accessor, user:*)` allows broad read with explicit relation only.
- Rate limit + IP-based abuse detection on share endpoints.

## Service-to-service

- Workers authenticate to API (if needed) via signed JWT with `service` audience.
- Worker → OpenFGA: shared OpenFGA secret in env.

## Admin / impersonation

- Admin override modeled as relation `admin` on workspace/org. No special bypass code path.
- Impersonation (support flow) issues short-lived Clerk token with `impersonator_id` claim — every action logged with both ids to audit.

## Security posture

- TLS everywhere.
- JWT verification on every protected request.
- OpenFGA `check` cached but **never** bypassed.
- Rate limit `/auth/*` 10/min/IP.
- Brute-force prevention handled by Clerk.
- Password reset handled by Clerk.
- Audit log entry per auth event (sign-in, sign-out, MFA add, password change via Clerk webhook).
- Secrets in env only; rotated quarterly.

## Failure modes

- Clerk down → BE rejects new auth (503). Existing JWTs still verify (signature only, no live check); allow read-only degraded mode optionally.
- OpenFGA down → deny-by-default for mutations; reads served from cache if hot; alert pages.
- Local DB user-mirror stale → re-sync on next request via webhook replay.

## Migration from current code (P0)

1. Delete deprecated Google OAuth backend routes.
2. Delete `password` column from `users` (migration).
3. Replace `auth.middleware.ts` static bearer with `verifyToken` impl.
4. Add Clerk webhook handler.
5. Update FE to ensure JWT attached via `useAuth().getToken()` on every call (centralize in `lib/fetcher.ts`).
