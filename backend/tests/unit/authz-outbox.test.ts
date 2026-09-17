import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FgaOutbox, FgaOutboxOp, FgaOutboxStatus } from "../../src/entities/FgaOutbox";
import { MAX_ATTEMPTS, drainOutbox } from "../../src/shared/services/authz/outbox";
import type { AuthorizationService } from "../../src/shared/services/authz/types";

// The drain's only real collaborators are an AuthorizationService and a
// DataSource. Both are stubbed here: Postgres behaviour (SKIP LOCKED, tx
// rollback) is covered by the live `pnpm fga:replay` run, not by unit tests.

let nextId = 0;

const row = (
    overrides: Partial<FgaOutbox> = {},
    op: FgaOutboxOp = "write"
): FgaOutbox =>
    ({
        id: `row_${(nextId += 1)}`,
        op,
        tuple: { user: "user:alice", relation: "owner", object: `file:${nextId}` },
        status: "pending" as FgaOutboxStatus,
        attempts: 0,
        last_error: null,
        created_at: new Date(),
        processed_at: null,
        ...overrides,
    }) as FgaOutbox;

/** Minimal stand-in for the query builder chain `claimRows` walks. */
const managerFor = (rows: FgaOutbox[], saved: FgaOutbox[], where: string[] = []) => {
    const builder = {
        where: (clause: string) => {
            where.push(clause);
            return builder;
        },
        andWhere: (clause: string) => {
            where.push(clause);
            return builder;
        },
        orderBy: () => builder,
        limit: () => builder,
        setLock: () => builder,
        setOnLocked: () => builder,
        getMany: async () => rows,
    };
    return {
        createQueryBuilder: () => builder,
        save: vi.fn(async (_entity: unknown, entity: FgaOutbox) => {
            saved.push(entity);
            return entity;
        }),
    };
};

const dataSourceFor = (rows: FgaOutbox[], saved: FgaOutbox[], found: FgaOutbox[] = []) => {
    const find = vi.fn(async () => found);
    const where: string[] = [];
    return {
        ds: {
            transaction: async (work: (manager: unknown) => Promise<unknown>) =>
                work(managerFor(rows, saved, where)),
            getRepository: () => ({ find }),
        } as never,
        find,
        /** WHERE fragments the claim query built — how backoff is asserted. */
        where,
    };
};

const authzStub = (): AuthorizationService & { write: ReturnType<typeof vi.fn> } => ({
    check: vi.fn(async () => false),
    batchCheck: vi.fn(async () => []),
    write: vi.fn(async () => undefined),
});

describe("drainOutbox", () => {
    beforeEach(() => {
        nextId = 0;
    });

    it("writes a pending tuple and marks the row done", async () => {
        const pending = row();
        const saved: FgaOutbox[] = [];
        const authz = authzStub();
        const { ds } = dataSourceFor([pending], saved);

        const result = await drainOutbox({ authz, ds });

        expect(authz.write).toHaveBeenCalledWith({ writes: [pending.tuple] });
        expect(result).toMatchObject({ processed: 1, done: 1, failed: 0 });
        expect(saved[0].status).toBe("done");
        expect(saved[0].attempts).toBe(1);
        expect(saved[0].last_error).toBeNull();
        expect(saved[0].processed_at).toBeInstanceOf(Date);
    });

    it("sends a delete op as a tuple delete", async () => {
        const pending = row({}, "delete");
        const authz = authzStub();
        const { ds } = dataSourceFor([pending], []);

        await drainOutbox({ authz, ds });

        expect(authz.write).toHaveBeenCalledWith({ deletes: [pending.tuple] });
    });

    it("marks a row failed with attempts and last_error when OpenFGA rejects it", async () => {
        const saved: FgaOutbox[] = [];
        const authz = authzStub();
        authz.write.mockRejectedValueOnce(new Error("OpenFGA write failed. (boom)"));
        const { ds } = dataSourceFor([row({ attempts: 2 })], saved);

        const result = await drainOutbox({ authz, ds });

        expect(result).toMatchObject({ processed: 1, done: 0, failed: 1, dead: 0 });
        expect(saved[0].status).toBe("failed");
        expect(saved[0].attempts).toBe(3);
        expect(saved[0].last_error).toBe("OpenFGA write failed. (boom)");
    });

    it("backs a failed row off exponentially instead of retrying every tick", async () => {
        const saved: FgaOutbox[] = [];
        const authz = authzStub();
        authz.write.mockRejectedValue(new Error("unreachable"));
        const { ds } = dataSourceFor([row({ attempts: 1 })], saved);

        const before = Date.now();
        await drainOutbox({ authz, ds });

        // attempts becomes 2 -> 2^2 = 4s.
        const delay = saved[0].next_attempt_at!.getTime() - before;
        expect(delay).toBeGreaterThanOrEqual(3_500);
        expect(delay).toBeLessThanOrEqual(4_500);
    });

    it("dead-letters a row once it exhausts MAX_ATTEMPTS", async () => {
        const saved: FgaOutbox[] = [];
        const authz = authzStub();
        authz.write.mockRejectedValue(new Error("bad tuple"));
        const { ds } = dataSourceFor([row({ attempts: MAX_ATTEMPTS - 1 })], saved);

        const result = await drainOutbox({ authz, ds });

        expect(result).toMatchObject({ failed: 0, dead: 1 });
        expect(saved[0].status).toBe("dead");
        // Nothing left to schedule: a dead row is only revived on request.
        expect(saved[0].next_attempt_at).toBeNull();
    });

    it("honours the backoff on a normal pass but ignores it on an explicit retry", async () => {
        const authz = authzStub();
        const normal = dataSourceFor([], []);
        await drainOutbox({ authz, ds: normal.ds });
        expect(normal.where.join(" ")).toContain("next_attempt_at");

        const forced = dataSourceFor([], []);
        await drainOutbox({ authz, ds: forced.ds }, { includeFailed: true });
        expect(forced.where.join(" ")).not.toContain("next_attempt_at");
    });

    it("claims dead rows only when asked to revive them", async () => {
        const authz = authzStub();
        const normal = dataSourceFor([], []);
        await drainOutbox({ authz, ds: normal.ds });
        expect(normal.where.join(" ")).toContain("status IN");

        const revived = dataSourceFor([row({ status: "dead" })], []);
        const result = await drainOutbox(
            { authz, ds: revived.ds },
            { includeDead: true }
        );
        expect(result.done).toBe(1);
    });

    it("reports the objects whose tuples landed, so the cache can be purged", async () => {
        const authz = authzStub();
        authz.write.mockRejectedValueOnce(new Error("boom"));
        const applied = vi.fn(async () => undefined);
        const first = row();
        const second = row();
        const { ds } = dataSourceFor([first, second], []);

        await drainOutbox({ authz, ds, onTuplesApplied: applied });

        // Only the tuple that actually reached OpenFGA — purging for a failed
        // write would drop cache entries that are still correct.
        expect(applied).toHaveBeenCalledWith([second.tuple.object]);
    });

    it("skips the purge hook when nothing was applied", async () => {
        const authz = authzStub();
        const applied = vi.fn(async () => undefined);
        const { ds } = dataSourceFor([], []);

        await drainOutbox({ authz, ds, onTuplesApplied: applied });

        expect(applied).not.toHaveBeenCalled();
    });

    it("keeps draining after a failure — one bad tuple does not poison the batch", async () => {
        const saved: FgaOutbox[] = [];
        const authz = authzStub();
        authz.write.mockRejectedValueOnce(new Error("boom"));
        const { ds } = dataSourceFor([row(), row(), row()], saved);

        const result = await drainOutbox({ authz, ds });

        expect(result).toMatchObject({ processed: 3, done: 2, failed: 1 });
        expect(saved.map((entity) => entity.status)).toEqual(["failed", "done", "done"]);
    });

    it("truncates a long error message", async () => {
        const saved: FgaOutbox[] = [];
        const authz = authzStub();
        authz.write.mockRejectedValueOnce(new Error("x".repeat(900)));
        const { ds } = dataSourceFor([row()], saved);

        await drainOutbox({ authz, ds });

        expect(saved[0].last_error).toHaveLength(500);
    });

    it("dry run reads candidates and mutates nothing", async () => {
        const candidate = row();
        const saved: FgaOutbox[] = [];
        const authz = authzStub();
        const { ds, find } = dataSourceFor([], saved, [candidate]);

        const result = await drainOutbox({ authz, ds }, { dryRun: true, limit: 10 });

        expect(authz.write).not.toHaveBeenCalled();
        expect(saved).toHaveLength(0);
        expect(result).toMatchObject({ processed: 1, done: 0, failed: 0 });
        expect(result.rows).toEqual([candidate]);
        expect(find).toHaveBeenCalledWith(
            expect.objectContaining({ where: [{ status: "pending" }], take: 10 })
        );
    });

    it("dry run includes failed rows with --retry-failed", async () => {
        const authz = authzStub();
        const { ds, find } = dataSourceFor([], [], []);

        await drainOutbox({ authz, ds }, { dryRun: true, includeFailed: true });

        expect(find).toHaveBeenCalledWith(
            expect.objectContaining({ where: [{ status: "pending" }, { status: "failed" }] })
        );
    });

    it("reports an empty pass without touching OpenFGA", async () => {
        const authz = authzStub();
        const { ds } = dataSourceFor([], []);

        const result = await drainOutbox({ authz, ds });

        expect(result).toMatchObject({ processed: 0, done: 0, failed: 0, dead: 0, rows: [] });
        expect(authz.write).not.toHaveBeenCalled();
    });
});
