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

/**
 * Attempts before a row is declared dead. Five failures spaced by the backoff
 * below spans roughly two minutes, which outlives a restart or a brief OpenFGA
 * blip; anything still failing after that is a bad tuple, not bad luck.
 */
export const MAX_ATTEMPTS = 5;

/** Exponential, capped: 2s, 4s, 8s, 16s, 32s … never more than a minute. */
const BACKOFF_CAP_MS = 60_000;
const backoffMs = (attempts: number): number =>
    Math.min(2 ** attempts * 1_000, BACKOFF_CAP_MS);

export type DrainOptions = {
    /** Max rows claimed in one pass. Default 500. */
    limit?: number;
    /** Also retry rows previously marked `failed`, ignoring their backoff. */
    includeFailed?: boolean;
    /** Also retry rows the drain gave up on. Explicit by design. */
    includeDead?: boolean;
    /** Report what would be drained; write nothing to OpenFGA or Postgres. */
    dryRun?: boolean;
};

export type DrainResult = {
    /** Rows claimed this pass, or the dry-run candidate count. */
    processed: number;
    done: number;
    failed: number;
    /** Rows that exhausted MAX_ATTEMPTS during this pass. */
    dead: number;
    /** The claimed rows, in drain order — for CLI listing and worker logging. */
    rows: FgaOutbox[];
};

export type DrainDeps = {
    authz: AuthorizationService;
    ds: DataSource;
    /**
     * Called with the objects whose tuples just reached OpenFGA, so the
     * permission cache can drop them. Optional: the unit tests and the CLI
     * construct a drain without Redis, and a purge is best-effort anyway.
     */
    onTuplesApplied?: (objects: string[]) => Promise<void>;
};

const statusesFor = (options: DrainOptions): FgaOutboxStatus[] => {
    const statuses: FgaOutboxStatus[] = ["pending"];
    if (options.includeFailed || options.includeDead) statuses.push("failed");
    if (options.includeDead) statuses.push("dead");
    return statuses;
};

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
    limit: number,
    respectBackoff: boolean
): Promise<FgaOutbox[]> => {
    const query = manager
        .createQueryBuilder(FgaOutbox, "outbox")
        .where("outbox.status IN (:...statuses)", { statuses })
        .orderBy("outbox.created_at", "ASC")
        .limit(limit)
        .setLock("pessimistic_write")
        .setOnLocked("skip_locked");

    if (respectBackoff) {
        // A row waiting out its backoff is invisible to the worker's tick, but
        // an operator asking for a retry explicitly gets it now.
        query.andWhere(
            "(outbox.next_attempt_at IS NULL OR outbox.next_attempt_at <= NOW())"
        );
    }

    return query.getMany();
};

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
    { authz, ds, onTuplesApplied }: DrainDeps,
    options: DrainOptions = {}
): Promise<DrainResult> => {
    const limit = options.limit ?? DEFAULT_DRAIN_LIMIT;
    const statuses = statusesFor(options);
    // An explicit retry means "now", not "when the backoff says so".
    const respectBackoff = !options.includeFailed && !options.includeDead;

    if (options.dryRun) {
        const rows = await ds.getRepository(FgaOutbox).find({
            where: statuses.map((status) => ({ status })),
            order: { created_at: "ASC" },
            take: limit,
        });
        return { processed: rows.length, done: 0, failed: 0, dead: 0, rows };
    }

    const applied: string[] = [];

    const result = await ds.transaction(async (manager) => {
        const rows = await claimRows(manager, statuses, limit, respectBackoff);
        const pass: DrainResult = {
            processed: rows.length,
            done: 0,
            failed: 0,
            dead: 0,
            rows,
        };

        for (const row of rows) {
            try {
                await applyTuple(authz, row);
                row.status = "done";
                row.attempts += 1;
                row.last_error = null;
                row.processed_at = new Date();
                row.next_attempt_at = null;
                pass.done += 1;
                applied.push(row.tuple.object);
            } catch (error) {
                row.attempts += 1;
                row.last_error = errorMessage(error);
                row.processed_at = new Date();

                if (row.attempts >= MAX_ATTEMPTS) {
                    // Out of retries: stop touching it, so one bad tuple cannot
                    // keep the drain busy forever. `--revive-dead` is the way back.
                    row.status = "dead";
                    row.next_attempt_at = null;
                    pass.dead += 1;
                } else {
                    row.status = "failed";
                    row.next_attempt_at = new Date(Date.now() + backoffMs(row.attempts));
                    pass.failed += 1;
                }
            }
            await manager.save(FgaOutbox, row);
        }

        return pass;
    });

    // After the transaction: a purge is only correct once the tuples are
    // committed, and it must not hold the row locks while talking to Redis.
    if (applied.length > 0 && onTuplesApplied) {
        await onTuplesApplied(applied);
    }

    return result;
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

    const counts: OutboxCounts = { pending: 0, done: 0, failed: 0, dead: 0 };
    for (const row of rows) {
        counts[row.status] = Number(row.count);
    }
    return counts;
};
