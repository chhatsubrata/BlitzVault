/**
 * `fga_outbox` drain (Week 3 Tue Dev3).
 *
 * Services write resource rows and their tuple rows in one DB transaction
 * (never dual-write to OpenFGA inline); this drains those rows to OpenFGA.
 * Two callers share it: the `fga:replay` CLI today, and the BullMQ outbox
 * worker (Wed) — which adds retry/backoff and the dead-letter policy on top.
 * Nothing here knows about queues, so both stay honest.
 *
 * Idempotent by construction: replaying a tuple that is already in OpenFGA (or
 * deleting one that is gone) is a benign no-op inside the adapter, so a row may
 * safely be processed twice after a crash between the OpenFGA write and the
 * status update.
 */
import { DataSource, EntityManager } from "typeorm";

import { FgaOutbox, FgaOutboxStatus } from "../../../entities/FgaOutbox";
import { AuthorizationService } from "./types";

export const DEFAULT_DRAIN_LIMIT = 500;

/** `last_error` is for humans in `psql`; keep a stack trace from filling the page. */
const MAX_ERROR_LENGTH = 500;

export type DrainOptions = {
    /** Max rows claimed in one pass. Default 500. */
    limit?: number;
    /** Also retry rows previously marked `failed`. */
    includeFailed?: boolean;
    /** Report what would be drained; write nothing to OpenFGA or Postgres. */
    dryRun?: boolean;
};

export type DrainResult = {
    /** Rows claimed this pass (`done + failed`, or the dry-run candidate count). */
    processed: number;
    done: number;
    failed: number;
    /** The claimed rows, in drain order — for CLI listing and worker logging. */
    rows: FgaOutbox[];
};

export type DrainDeps = {
    authz: AuthorizationService;
    ds: DataSource;
};

const statusesFor = (includeFailed: boolean): FgaOutboxStatus[] =>
    includeFailed ? ["pending", "failed"] : ["pending"];

const errorMessage = (error: unknown): string => {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, MAX_ERROR_LENGTH);
};

/**
 * Claim the oldest drainable rows for this caller only.
 *
 * `FOR UPDATE SKIP LOCKED` is what lets the CLI and the worker (or two worker
 * replicas) run at the same time without processing a row twice: a row locked
 * by one drain is invisible to the other rather than making it wait.
 */
const claimRows = (
    manager: EntityManager,
    statuses: FgaOutboxStatus[],
    limit: number
): Promise<FgaOutbox[]> =>
    manager
        .createQueryBuilder(FgaOutbox, "outbox")
        .where("outbox.status IN (:...statuses)", { statuses })
        .orderBy("outbox.created_at", "ASC")
        .limit(limit)
        .setLock("pessimistic_write")
        .setOnLocked("skip_locked")
        .getMany();

const applyTuple = async (
    authz: AuthorizationService,
    row: FgaOutbox
): Promise<void> => {
    if (row.op === "write") {
        await authz.write({ writes: [row.tuple] });
        return;
    }
    await authz.write({ deletes: [row.tuple] });
};

/**
 * Drain one batch. Never throws for a bad tuple — a single poisoned row must
 * not stop its neighbours; it is marked `failed` with `last_error` and the pass
 * continues. Infrastructure failures (Postgres down) still propagate.
 *
 * The OpenFGA calls happen while the batch's row locks are held. That bounds
 * the lock to `limit` rows for the length of the batch, and keeps a crash
 * mid-batch from leaving rows claimed-but-unprocessed — the transaction rolls
 * back and the next pass picks them up.
 */
export const drainOutbox = async (
    { authz, ds }: DrainDeps,
    options: DrainOptions = {}
): Promise<DrainResult> => {
    const limit = options.limit ?? DEFAULT_DRAIN_LIMIT;
    const statuses = statusesFor(options.includeFailed ?? false);

    if (options.dryRun) {
        const rows = await ds.getRepository(FgaOutbox).find({
            where: statuses.map((status) => ({ status })),
            order: { created_at: "ASC" },
            take: limit,
        });
        return { processed: rows.length, done: 0, failed: 0, rows };
    }

    return ds.transaction(async (manager) => {
        const rows = await claimRows(manager, statuses, limit);
        const result: DrainResult = { processed: rows.length, done: 0, failed: 0, rows };

        for (const row of rows) {
            try {
                await applyTuple(authz, row);
                row.status = "done";
                row.attempts += 1;
                row.last_error = null;
                row.processed_at = new Date();
                result.done += 1;
            } catch (error) {
                row.status = "failed";
                row.attempts += 1;
                row.last_error = errorMessage(error);
                row.processed_at = new Date();
                result.failed += 1;
            }
            await manager.save(FgaOutbox, row);
        }

        return result;
    });
};

export type OutboxCounts = Record<FgaOutboxStatus, number>;

/** Row counts per status — the CLI's `--status` view and a worker health metric. */
export const countOutboxByStatus = async (ds: DataSource): Promise<OutboxCounts> => {
    const rows = await ds
        .getRepository(FgaOutbox)
        .createQueryBuilder("outbox")
        .select("outbox.status", "status")
        .addSelect("COUNT(*)", "count")
        .groupBy("outbox.status")
        .getRawMany<{ status: FgaOutboxStatus; count: string }>();

    const counts: OutboxCounts = { pending: 0, done: 0, failed: 0 };
    for (const row of rows) {
        counts[row.status] = Number(row.count);
    }
    return counts;
};
