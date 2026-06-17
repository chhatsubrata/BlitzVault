// Redis-backed request rate limiting (see docs/rate-limiting.md). Counters live
// in Redis so limits hold across instances. Fails OPEN: if Redis is unreachable
// the request is allowed (availability over strict enforcement).

import type { RequestHandler } from "express";
import { ipKeyGenerator, rateLimit as expressRateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import IORedis from "ioredis";

import { env } from "../config/env";
import { logger } from "../utils/logger";
import { RateLimitedError } from "../errors/AppError";

const MINUTE_MS = 60_000;

// Limit tiers per docs/rate-limiting.md. `write` is reserved for Phase 1 mutating
// routes; wired here so the tier exists when those routes land.
const TIERS = {
    strict: { windowMs: MINUTE_MS, limit: 10 },
    write: { windowMs: MINUTE_MS, limit: 60 },
    default: { windowMs: MINUTE_MS, limit: 120 },
} as const;

export type RateLimitTier = keyof typeof TIERS;

const passThrough: RequestHandler = (_req, _res, next) => next();

// One shared, fail-fast Redis client for all limiters. NOT the BullMQ client
// (maxRetriesPerRequest:null) — that would queue forever when Redis is down and
// hang requests. Here commands reject fast so passOnStoreError can fail open.
let rateLimitRedis: IORedis | undefined;

const getRateLimitRedis = (): IORedis => {
    if (!rateLimitRedis) {
        // Eager connect (default) so the client is ready before requests arrive.
        // enableOfflineQueue:false + low retries => when Redis is DOWN, commands
        // reject fast and passOnStoreError lets the request through (fail-open).
        rateLimitRedis = new IORedis({
            host: env.REDIS_HOST,
            port: env.REDIS_PORT,
            password: env.REDIS_PASSWORD,
            enableOfflineQueue: false,
            maxRetriesPerRequest: 1,
        });
        rateLimitRedis.on("error", (err) =>
            logger.warn({ err }, "rate-limit redis error (failing open)")
        );
    }
    return rateLimitRedis;
};

/**
 * Returns rate-limit middleware for a tier. No-op when RATE_LIMIT_ENABLED is
 * false (CI tests / Redis-less envs). Keyed per authenticated user, falling back
 * to client IP pre-auth; the store prefix namespaces tiers.
 */
export const rateLimit = (tier: RateLimitTier): RequestHandler => {
    if (!env.RATE_LIMIT_ENABLED) {
        return passThrough;
    }

    const { windowMs, limit } = TIERS[tier];
    const client = getRateLimitRedis();

    const limiter = expressRateLimit({
        windowMs,
        limit,
        standardHeaders: "draft-7",
        legacyHeaders: false,
        store: new RedisStore({
            prefix: `rl:${tier}:`,
            sendCommand: (...args: string[]) =>
                client.call(...(args as [string, ...string[]])) as Promise<number>,
        }),
        keyGenerator: (req) =>
            req.auth?.clerkUserId ?? ipKeyGenerator(req.ip ?? ""),
        // Route through the central errorHandler so the 429 body matches the
        // standard error envelope ({ error: { code: "RATE_LIMITED", ... } }).
        handler: (_req, _res, next) =>
            next(new RateLimitedError("Too many requests. Retry later.")),
    });

    // Fail OPEN: a Redis/store error surfaces as next(err) — swallow it and allow
    // the request. Only the intentional RateLimitedError (limit exceeded) passes
    // through to the errorHandler as a 429.
    return (req, res, next) => {
        limiter(req, res, (err?: unknown) => {
            if (err && !(err instanceof RateLimitedError)) {
                logger.warn({ err }, "rate-limit store error; failing open");
                return next();
            }
            return next(err as Error | undefined);
        });
    };
};
