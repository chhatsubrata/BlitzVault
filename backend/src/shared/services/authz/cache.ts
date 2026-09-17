/**
 * Redis permission cache in front of OpenFGA (Week 3 Wed Dev3).
 *
 * Every `:id` route runs `authorize()` → `check()`, so an uncached check is a
 * network hop on the critical path of nearly every request. This decorator
 * wraps any AuthorizationService, which is why `authorize()` needs no change:
 * the factory decides what is live, callers only see the interface.
 *
 * Keys: `fga:<object>:<user>:<relation>` — object FIRST, unlike the sketch in
 * docs/openfga-model.md. Invalidation is always "everything known about this
 * resource", so the resource leads the key and every key for it shares a prefix.
 *
 * Purging: each cached key is also added to a per-object set, `fga:idx:<object>`,
 * and a purge reads that set and unlinks its members — O(members). `SCAN MATCH`
 * is what the sprint line literally describes, but Redis walks the entire
 * keyspace regardless of the pattern, so every share would pay for every key in
 * Redis, BullMQ's and the rate limiter's included.
 *
 * Failure policy: any Redis problem falls through to the wrapped service. The
 * cache failing open still lands on OpenFGA, which fails closed — so a Redis
 * outage costs latency, never a wrong answer.
 */
import IORedis from "ioredis";

import { env } from "../../config/env";
import { logger } from "../../utils/logger";
import {
    AuthorizationService,
    CheckRequest,
    ReadRequest,
    TupleKey,
    WriteRequest,
} from "./types";

const KEY_PREFIX = "fga";
const INDEX_PREFIX = "fga:idx";

const cacheKey = (request: CheckRequest): string =>
    `${KEY_PREFIX}:${request.object}:${request.user}:${request.relation}`;

const indexKey = (object: string): string => `${INDEX_PREFIX}:${object}`;

// --- Client -----------------------------------------------------------------

let client: IORedis | undefined;
// Log an outage once, not per request — ioredis re-emits `error` on every retry.
let degraded = false;

/**
 * Own client, deliberately NOT `redisConnectionOptions`: that is BullMQ-tuned
 * (`maxRetriesPerRequest: null`), which queues commands forever when Redis is
 * down and would hang the request instead of falling through to OpenFGA.
 */
const getClient = (): IORedis => {
    if (!client) {
        client = new IORedis({
            host: env.REDIS_HOST,
            port: env.REDIS_PORT,
            password: env.REDIS_PASSWORD,
            // Offline queue ON, unlike the rate limiter: the very first check
            // after boot can land before the socket is ready, and rejecting it
            // would drop a purge on the floor. `maxRetriesPerRequest` still
            // bounds the wait when Redis is genuinely down.
            maxRetriesPerRequest: 1,
            retryStrategy: (times) => Math.min(times * 500, 10_000),
        });

        client.on("error", (err) => {
            if (!degraded) {
                degraded = true;
                logger.warn({ err }, "authz cache redis unavailable; checks go straight to OpenFGA");
            }
        });
        client.on("ready", () => {
            if (degraded) {
                degraded = false;
                logger.info("authz cache redis recovered");
            }
        });
    }
    return client;
};

/** Closes the cache connection. Called from the worker's shutdown path. */
export const closeAuthzCache = async (): Promise<void> => {
    if (!client) return;
    await client.quit().catch(() => client?.disconnect());
    client = undefined;
};

// --- Invalidation -----------------------------------------------------------

/**
 * Drop every cached decision about these objects.
 *
 * Called from both tuple write paths: when a grant is queued (so the next check
 * is cold rather than a stale "denied") and again when the worker drains it (so
 * a replay, the CLI, or a crash between the two still purges). Idempotent, and
 * never throws — a failed purge means a decision stays cached for at most the
 * TTL, which is not worth failing a share over.
 */
export const invalidateResource = async (objects: string[]): Promise<void> => {
    const unique = [...new Set(objects)].filter(Boolean);
    if (unique.length === 0) return;

    try {
        const redis = getClient();
        for (const object of unique) {
            const index = indexKey(object);
            const members = await redis.smembers(index);
            // UNLINK frees memory off the main thread; the index goes with it.
            await redis.unlink(...members, index);
        }
    } catch (err) {
        logger.warn({ err, objects: unique }, "authz cache purge failed; entries expire by TTL");
    }
};

/** Objects a set of tuples refers to — what a write has to purge. */
export const objectsOf = (tuples: TupleKey[]): string[] =>
    tuples.map((tuple) => tuple.object);

// --- Decorator --------------------------------------------------------------

export class CachedAuthorizationService implements AuthorizationService {
    private readonly inner: AuthorizationService;
    private readonly ttlSeconds: number;

    constructor(inner: AuthorizationService, ttlSeconds = env.FGA_CACHE_TTL_SECONDS) {
        this.inner = inner;
        this.ttlSeconds = ttlSeconds;
    }

    async check(request: CheckRequest): Promise<boolean> {
        const cached = await this.read(cacheKey(request));
        if (cached !== undefined) return cached;

        const allowed = await this.inner.check(request);
        await this.store([[request, allowed]]);
        return allowed;
    }

    /**
     * One MGET for the batch, then a single inner call for the misses only.
     * List filtering (Thu) is the heaviest consumer, and a 50-item list where
     * 45 are warm should cost one round trip, not 50.
     */
    async batchCheck(requests: CheckRequest[]): Promise<boolean[]> {
        if (requests.length === 0) return [];

        const cached = await this.readMany(requests.map(cacheKey));
        const missIndexes = requests
            .map((_request, index) => index)
            .filter((index) => cached[index] === undefined);

        if (missIndexes.length === 0) {
            return cached.map((value) => value ?? false);
        }

        const fetched = await this.inner.batchCheck(
            missIndexes.map((index) => requests[index])
        );

        const results = [...cached];
        const toStore: Array<[CheckRequest, boolean]> = [];
        missIndexes.forEach((requestIndex, missIndex) => {
            results[requestIndex] = fetched[missIndex];
            toStore.push([requests[requestIndex], fetched[missIndex]]);
        });

        await this.store(toStore);
        return results.map((value) => value ?? false);
    }

    /**
     * Writes pass through, then purge. Runtime writes go through the outbox, so
     * this mainly covers scripts and tests calling the service directly — but a
     * write that left the cache stale would be a nasty trap for whoever does.
     */
    async write(request: WriteRequest): Promise<void> {
        await this.inner.write(request);
        await invalidateResource(
            objectsOf([...(request.writes ?? []), ...(request.deletes ?? [])])
        );
    }

    /** Not cached: the share dialog reads it, and it must not lag a revoke. */
    readTuples(request: ReadRequest): Promise<TupleKey[]> {
        return this.inner.readTuples(request);
    }

    // --- Redis plumbing (every path falls through on error) -----------------

    private async read(key: string): Promise<boolean | undefined> {
        try {
            const value = await getClient().get(key);
            if (value === null) return undefined;
            return value === "1";
        } catch {
            // The `error` listener already logged; treat it as a miss.
            return undefined;
        }
    }

    private async readMany(keys: string[]): Promise<Array<boolean | undefined>> {
        try {
            const values = await getClient().mget(keys);
            return values.map((value) =>
                value === null ? undefined : value === "1"
            );
        } catch {
            return keys.map(() => undefined);
        }
    }

    /**
     * Cache the decision and index it under its object. Negative answers are
     * cached too — a denied user retrying is exactly the hot path worth
     * absorbing — which is what makes purging on grant non-optional.
     */
    private async store(entries: Array<[CheckRequest, boolean]>): Promise<void> {
        if (entries.length === 0) return;

        try {
            const pipeline = getClient().pipeline();
            for (const [request, allowed] of entries) {
                const key = cacheKey(request);
                const index = indexKey(request.object);
                pipeline.set(key, allowed ? "1" : "0", "EX", this.ttlSeconds);
                pipeline.sadd(index, key);
                // The index must outlive its members, or a purge would miss
                // keys; one TTL beyond the entry TTL is enough.
                pipeline.expire(index, this.ttlSeconds * 2);
            }
            await pipeline.exec();
        } catch {
            // Already logged by the client's error listener. A failed write
            // costs a cache miss next time, nothing more.
        }
    }
}
