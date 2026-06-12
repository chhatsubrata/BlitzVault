# Rate Limiting — Design Spike (Week 1 Dev3)

> **Status:** Design only. No code this week. Implementation is a Friday Dev3
> stretch (`express-rate-limit` on `/auth/sync`) and hardens in Phase 1+.
> Aligns with the middleware chain in [`backend/CLAUDE.md`](../backend/CLAUDE.md)
> (`… → rateLimit → validateRequest → requireClerkAuth → …`).

## Goal

Protect the API from abuse (credential stuffing, scraping, runaway clients)
without hurting normal use. Limits must be **shared across backend instances**,
so counters live in **Redis** (already in [`docker-compose.dev.yml`](../docker-compose.dev.yml)
on `:6379`), not in process memory.

## Library choice

| Concern | Decision |
|---|---|
| Limiter | [`express-rate-limit`](https://www.npmjs.com/package/express-rate-limit) — mature, Express 5 compatible |
| Store | [`rate-limit-redis`](https://www.npmjs.com/package/rate-limit-redis) — backs the limiter with shared Redis |
| Redis client | Reuse the app's Redis connection (BullMQ/cache share it); no second pool |

In-memory (default) store is rejected: per-instance counters let a client
multiply its budget by the number of pods and reset on every deploy.

## Limit tiers

Keyed per **authenticated user** (`req.auth.userId`) when present, else client IP
(`req.ip`, behind `app.set('trust proxy', …)`). Window = sliding via Redis.

| Tier | Routes | Window | Max | Rationale |
|---|---|---|---|---|
| `strict` | `POST /auth/sync`, signin/signup | 1 min | 10 | Auth endpoints are the abuse magnet |
| `write` | mutating file/folder ops (Phase 1) | 1 min | 60 | Guard write amplification |
| `default` | everything else (reads) | 1 min | 120 | Generous; catches only runaway loops |

Numbers are starting points — tune from real traffic before raising.

## Key strategy

```
key = `rl:${tier}:${req.auth?.userId ?? req.ip}`
```

- Authenticated → per-user (fair across shared IPs / NAT).
- Unauthenticated (signin/signup) → per-IP (no user yet).
- Never trust client-supplied identifiers for the key.

## Response contract

On limit exceeded, return **429** with the standard error envelope
([`api-guidelines.md`](./api-guidelines.md), code `RATE_LIMITED`):

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Retry later.",
    "requestId": "req_..."
  }
}
```

Headers: emit standard `RateLimit-*` (draft-7, `standardHeaders: 'draft-7'`),
disable legacy `X-RateLimit-*`. Include `Retry-After`. The limiter's default
handler is overridden to route through the central `errorHandler` so the body
matches every other error.

## Middleware placement

Per `backend/CLAUDE.md`, rate limiting runs **before** validation and auth so we
reject floods cheaply — except auth-keyed tiers need `req.auth`, so the keying
falls back to IP when `requireClerkAuth` hasn't run yet. Practical order:

```
requestId → requestLogger → cors → helmet → rateLimit(default, IP-keyed)
  → route-specific rateLimit(strict, user-or-IP) → validateRequest
  → requireClerkAuth → … → errorHandler
```

## Failure mode (Redis down)

`fail-open` for availability: if Redis is unreachable, log an error and allow the
request rather than hard-blocking all traffic. Revisit if abuse is observed —
some endpoints (auth) may warrant `fail-closed`.

## Open questions (revisit Phase 1)

- Per-route overrides vs the three tiers — likely needed for uploads.
- Burst allowance (token bucket) vs fixed window for write ops.
- Whether to surface remaining quota to the frontend for UX (`RateLimit-*` already exposes it).

## Implementation checklist (when built)

- [ ] `pnpm add express-rate-limit rate-limit-redis` (backend)
- [ ] `shared/middleware/rateLimit.ts` factory: `rateLimit(tier)` → configured limiter
- [ ] Redis store wired to the shared client; `sendCommand` adapter
- [ ] Custom handler → `next(new RateLimitedError())` so envelope is centralized
- [ ] Apply `strict` to `/auth/sync`; `default` app-wide
- [ ] Integration test: 11th request in a minute → 429 + envelope
