import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// One fake ioredis instance shared by the module under test. Hoisted so the
// vi.mock factory can close over it.
const redis = vi.hoisted(() => {
    const store = new Map<string, string>();
    const sets = new Map<string, Set<string>>();
    let broken = false;

    const guard = () => {
        if (broken) throw new Error("redis down");
    };

    const pipeline = () => {
        const queued: Array<() => void> = [];
        const chain = {
            set: (key: string, value: string) => {
                queued.push(() => store.set(key, value));
                return chain;
            },
            sadd: (key: string, member: string) => {
                queued.push(() => {
                    const existing = sets.get(key) ?? new Set<string>();
                    existing.add(member);
                    sets.set(key, existing);
                });
                return chain;
            },
            expire: () => chain,
            exec: async () => {
                guard();
                queued.forEach((apply) => apply());
                return [];
            },
        };
        return chain;
    };

    return {
        store,
        sets,
        setBroken: (value: boolean) => {
            broken = value;
        },
        client: {
            on: vi.fn(),
            get: vi.fn(async (key: string) => {
                guard();
                return store.get(key) ?? null;
            }),
            mget: vi.fn(async (keys: string[]) => {
                guard();
                return keys.map((key) => store.get(key) ?? null);
            }),
            smembers: vi.fn(async (key: string) => {
                guard();
                return [...(sets.get(key) ?? [])];
            }),
            unlink: vi.fn(async (...keys: string[]) => {
                guard();
                for (const key of keys) {
                    store.delete(key);
                    sets.delete(key);
                }
                return keys.length;
            }),
            pipeline: vi.fn(pipeline),
            quit: vi.fn(async () => "OK"),
            disconnect: vi.fn(),
        },
    };
});

vi.mock("ioredis", () => ({
    default: vi.fn(function () {
        return redis.client;
    }),
}));

import {
    CachedAuthorizationService,
    invalidateResource,
} from "../../src/shared/services/authz/cache";
import type { AuthorizationService } from "../../src/shared/services/authz/types";

/**
 * The cache decorator. What matters: it must never change an answer, only where
 * the answer came from — and a Redis problem must fall through to OpenFGA
 * rather than denying (the inner service is the one that fails closed).
 */

const FILE = "file:f1";
const ALICE = "user:alice";

const request = (user = ALICE, relation = "can_read", object = FILE) => ({
    user,
    relation,
    object,
});

const innerStub = (): AuthorizationService & {
    check: ReturnType<typeof vi.fn>;
    batchCheck: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
} => ({
    check: vi.fn(async () => true),
    batchCheck: vi.fn(async (requests: unknown[]) => requests.map(() => true)),
    write: vi.fn(async () => undefined),
    readTuples: vi.fn(async () => []),
});

beforeEach(() => {
    redis.store.clear();
    redis.sets.clear();
    redis.setBroken(false);
    vi.clearAllMocks();
});

afterEach(() => redis.setBroken(false));

describe("CachedAuthorizationService.check", () => {
    it("asks OpenFGA once, then serves the cached decision", async () => {
        const inner = innerStub();
        const service = new CachedAuthorizationService(inner, 30);

        expect(await service.check(request())).toBe(true);
        expect(await service.check(request())).toBe(true);

        expect(inner.check).toHaveBeenCalledTimes(1);
        expect(redis.store.get(`fga:${FILE}:${ALICE}:can_read`)).toBe("1");
    });

    it("caches a denial too, and indexes it under the object", async () => {
        const inner = innerStub();
        inner.check.mockResolvedValue(false);
        const service = new CachedAuthorizationService(inner, 30);

        expect(await service.check(request())).toBe(false);
        expect(await service.check(request())).toBe(false);

        expect(inner.check).toHaveBeenCalledTimes(1);
        expect(redis.store.get(`fga:${FILE}:${ALICE}:can_read`)).toBe("0");
        // The index is what makes a purge possible without scanning Redis.
        expect([...(redis.sets.get(`fga:idx:${FILE}`) ?? [])]).toEqual([
            `fga:${FILE}:${ALICE}:can_read`,
        ]);
    });

    it("falls through to OpenFGA when Redis is down", async () => {
        const inner = innerStub();
        const service = new CachedAuthorizationService(inner, 30);
        redis.setBroken(true);

        expect(await service.check(request())).toBe(true);
        expect(await service.check(request())).toBe(true);
        // No cache, so every call is a real check — degraded, never wrong.
        expect(inner.check).toHaveBeenCalledTimes(2);
    });
});

describe("CachedAuthorizationService.batchCheck", () => {
    it("asks only for the misses and preserves input order", async () => {
        const inner = innerStub();
        const service = new CachedAuthorizationService(inner, 30);

        await service.check(request(ALICE, "can_read", "file:a"));
        inner.check.mockClear();
        inner.batchCheck.mockResolvedValue([false]);

        const result = await service.batchCheck([
            request(ALICE, "can_read", "file:a"), // warm
            request(ALICE, "can_read", "file:b"), // cold
        ]);

        expect(result).toEqual([true, false]);
        expect(inner.batchCheck).toHaveBeenCalledWith([
            request(ALICE, "can_read", "file:b"),
        ]);
    });

    it("skips OpenFGA entirely when every entry is warm", async () => {
        const inner = innerStub();
        const service = new CachedAuthorizationService(inner, 30);

        await service.check(request(ALICE, "can_read", "file:a"));
        await service.check(request(ALICE, "can_write", "file:a"));
        inner.batchCheck.mockClear();

        const result = await service.batchCheck([
            request(ALICE, "can_read", "file:a"),
            request(ALICE, "can_write", "file:a"),
        ]);

        expect(result).toEqual([true, true]);
        expect(inner.batchCheck).not.toHaveBeenCalled();
    });

    it("returns [] without touching Redis for an empty batch", async () => {
        const inner = innerStub();
        const service = new CachedAuthorizationService(inner, 30);

        expect(await service.batchCheck([])).toEqual([]);
        expect(redis.client.mget).not.toHaveBeenCalled();
    });
});

describe("invalidateResource", () => {
    it("drops every decision about one object and leaves the rest alone", async () => {
        const inner = innerStub();
        const service = new CachedAuthorizationService(inner, 30);

        await service.check(request(ALICE, "can_read", FILE));
        await service.check(request("user:bob", "can_read", FILE));
        await service.check(request(ALICE, "can_read", "folder:other"));

        await invalidateResource([FILE]);

        expect(redis.store.has(`fga:${FILE}:${ALICE}:can_read`)).toBe(false);
        expect(redis.store.has(`fga:${FILE}:user:bob:can_read`)).toBe(false);
        expect(redis.sets.has(`fga:idx:${FILE}`)).toBe(false);
        // A grant on one file must not cost every other cached decision.
        expect(redis.store.has(`fga:folder:other:${ALICE}:can_read`)).toBe(true);
    });

    it("re-asks OpenFGA after a purge", async () => {
        const inner = innerStub();
        inner.check.mockResolvedValue(false);
        const service = new CachedAuthorizationService(inner, 30);

        expect(await service.check(request())).toBe(false);
        await invalidateResource([FILE]);
        inner.check.mockResolvedValue(true);

        // The whole point: a revoked user must not keep their cached allow, and
        // a newly granted one must not keep their cached deny.
        expect(await service.check(request())).toBe(true);
    });

    it("does nothing for an empty list and never throws when Redis is down", async () => {
        await invalidateResource([]);
        expect(redis.client.smembers).not.toHaveBeenCalled();

        redis.setBroken(true);
        await expect(invalidateResource([FILE])).resolves.toBeUndefined();
    });
});

describe("CachedAuthorizationService.write", () => {
    it("purges the objects it wrote", async () => {
        const inner = innerStub();
        const service = new CachedAuthorizationService(inner, 30);

        await service.check(request());
        await service.write({ writes: [{ user: ALICE, relation: "viewer", object: FILE }] });

        expect(inner.write).toHaveBeenCalledTimes(1);
        expect(redis.store.has(`fga:${FILE}:${ALICE}:can_read`)).toBe(false);
    });
});
