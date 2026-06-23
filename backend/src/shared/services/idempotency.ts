// Idempotency store for mutating endpoints (e.g. POST /files/upload/init).
// Backed by Redis so a retried request with the same Idempotency-Key returns the
// original response across instances. Falls back to an in-process memory map when
// Redis is unreachable: single-instance / Redis-down still dedups (and tests stay
// deterministic without a Redis dependency). Multi-instance correctness relies on
// Redis being up — the memory map is a degraded, fail-open backstop.

import IORedis from "ioredis";

import { env } from "../config/env";
import { logger } from "../utils/logger";

type MemoryEntry = { value: string; expiresAt: number };

// Module-level so it persists across requests in the same process.
const memoryStore = new Map<string, MemoryEntry>();

// One shared, fail-fast client (mirrors rate-limit.ts): commands reject quickly
// when Redis is down so we fall back to memory instead of hanging requests.
let client: IORedis | undefined;

const getClient = (): IORedis | undefined => {
    if (!client) {
        client = new IORedis({
            host: env.REDIS_HOST,
            port: env.REDIS_PORT,
            password: env.REDIS_PASSWORD,
            enableOfflineQueue: false,
            maxRetriesPerRequest: 1,
            lazyConnect: false,
        });
        client.on("error", (err) =>
            logger.warn({ err }, "idempotency redis error (falling back to memory)")
        );
    }
    return client;
};

const buildKey = (scope: string, ownerId: string, key: string): string =>
    `idemp:${scope}:${ownerId}:${key}`;

const memoryGet = (storeKey: string): string | null => {
    const entry = memoryStore.get(storeKey);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
        memoryStore.delete(storeKey);
        return null;
    }
    return entry.value;
};

const memorySet = (storeKey: string, value: string, ttlSeconds: number): void => {
    memoryStore.set(storeKey, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
};

/**
 * Returns the cached response for `(scope, ownerId, key)`, or null if none.
 * Prefers Redis; falls back to the in-process map on any Redis error.
 */
export const readIdempotent = async <T>(
    scope: string,
    ownerId: string,
    key: string
): Promise<T | null> => {
    const storeKey = buildKey(scope, ownerId, key);

    try {
        const raw = await getClient()?.get(storeKey);
        if (raw) return JSON.parse(raw) as T;
    } catch (err) {
        logger.warn({ err }, "idempotency read failed; falling back to memory");
    }

    const fromMemory = memoryGet(storeKey);
    return fromMemory ? (JSON.parse(fromMemory) as T) : null;
};

/**
 * Caches `value` for `(scope, ownerId, key)` for `ttlSeconds`. Always writes the
 * memory backstop; Redis write is best-effort (logged, never throws).
 */
export const writeIdempotent = async (
    scope: string,
    ownerId: string,
    key: string,
    value: unknown,
    ttlSeconds: number
): Promise<void> => {
    const storeKey = buildKey(scope, ownerId, key);
    const raw = JSON.stringify(value);

    memorySet(storeKey, raw, ttlSeconds);

    try {
        await getClient()?.set(storeKey, raw, "EX", ttlSeconds);
    } catch (err) {
        logger.warn({ err }, "idempotency write failed (memory backstop kept)");
    }
};
