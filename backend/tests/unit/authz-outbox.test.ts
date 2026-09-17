import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FgaOutbox, FgaOutboxOp, FgaOutboxStatus } from "../../src/entities/FgaOutbox";
import { drainOutbox } from "../../src/shared/services/authz/outbox";
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
const managerFor = (rows: FgaOutbox[], saved: FgaOutbox[]) => {
    const builder = {
        where: () => builder,
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
    return {
        ds: {
            transaction: async (work: (manager: unknown) => Promise<unknown>) =>
                work(managerFor(rows, saved)),
            getRepository: () => ({ find }),
        } as never,
        find,
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

        expect(result).toMatchObject({ processed: 1, done: 0, failed: 1 });
        expect(saved[0].status).toBe("failed");
        expect(saved[0].attempts).toBe(3);
        expect(saved[0].last_error).toBe("OpenFGA write failed. (boom)");
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

        expect(result).toMatchObject({ processed: 0, done: 0, failed: 0, rows: [] });
        expect(authz.write).not.toHaveBeenCalled();
    });
});
