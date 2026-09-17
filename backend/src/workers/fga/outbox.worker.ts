import { Job, Queue, Worker } from "bullmq";

import AppDataSource from "../../config/db";
import { redisConnectionOptions, redisProducerOptions } from "../../shared/config/redis";
import {
    drainOutbox,
    getAuthorizationService,
    invalidateResource,
} from "../../shared/services/authz";
import { logger } from "../../shared/utils/logger";
import {
    FGA_OUTBOX_JOB_NAME,
    FGA_OUTBOX_POLL_MS,
    QUEUE_NAMES,
    type FgaOutboxJobData,
    type FgaOutboxJobResult,
} from "../queues";

/**
 * `fga_outbox` drain worker (Week 3 Wed Dev1).
 *
 * Request paths never call OpenFGA: they save tuple rows in the same
 * transaction as the resource, and this worker pushes them out. The drain
 * itself is `drainOutbox` — the same function `pnpm fga:replay` runs, so the
 * manual tool and the worker can never diverge.
 *
 * A repeatable job keeps the queue ticking; an ad-hoc job can be added after a
 * write to cut the lag. Jobs carry no tuples, so overlapping runs are safe.
 *
 * Deliberately thin: retry/backoff tuning, the dead-letter policy and `fga:*`
 * cache invalidation are Dev3's, layered on this file.
 */

/**
 * Built on first use, not at import. The API imports this module only to nudge
 * the drain after a share; constructing the queue eagerly would open a Redis
 * connection in every process that merely imports the sharing service —
 * including one-off scripts, which would then never exit.
 */
let queue: Queue<FgaOutboxJobData, FgaOutboxJobResult> | undefined;

export const fgaOutboxQueue = (): Queue<FgaOutboxJobData, FgaOutboxJobResult> =>
    (queue ??= new Queue<FgaOutboxJobData, FgaOutboxJobResult>(QUEUE_NAMES.fgaOutbox, {
        // Producer-side, and the API enqueues from a request handler — so the
        // fail-fast connection, not the blocking one the worker needs.
        connection: redisProducerOptions,
        defaultJobOptions: {
            attempts: 3,
            backoff: { type: "exponential", delay: 1_000 },
            removeOnComplete: 100,
            removeOnFail: 1_000,
        },
    }));

/** Closes the producer queue if one was ever opened. */
export const closeOutboxQueue = async (): Promise<void> => {
    if (!queue) return;
    await queue.close();
    queue = undefined;
};

/**
 * Nudge the drain after a tuple write instead of waiting for the next tick.
 *
 * Fire-and-forget on purpose: the share already committed, the repeatable job
 * picks the row up within a second regardless, and a Redis hiccup must not fail
 * a request that succeeded.
 */
export const enqueueOutboxDrain = (data: FgaOutboxJobData = {}): void => {
    void fgaOutboxQueue()
        .add(FGA_OUTBOX_JOB_NAME, data)
        .catch((err) =>
            logger.warn({ err }, "fga outbox: nudge failed; the repeat tick will drain")
        );
};

/**
 * Register the repeating drain. Keyed by job id so restarts reuse the one
 * schedule rather than stacking duplicates.
 */
export const scheduleOutboxDrain = () =>
    fgaOutboxQueue().add(
        FGA_OUTBOX_JOB_NAME,
        {},
        {
            repeat: { every: FGA_OUTBOX_POLL_MS },
            jobId: "fga-outbox-repeat",
        }
    );

export const createFgaOutboxWorker = (): Worker<
    FgaOutboxJobData,
    FgaOutboxJobResult
> => {
    const worker = new Worker<FgaOutboxJobData, FgaOutboxJobResult>(
        QUEUE_NAMES.fgaOutbox,
        async (
            job: Job<FgaOutboxJobData, FgaOutboxJobResult>
        ): Promise<FgaOutboxJobResult> => {
            const { processed, done, failed, dead } = await drainOutbox(
                {
                    authz: getAuthorizationService(),
                    ds: AppDataSource,
                    // Purge again once the tuples are really in OpenFGA: the
                    // enqueue-time purge can be undone by a check that lands
                    // between queueing and draining.
                    onTuplesApplied: invalidateResource,
                },
                { limit: job.data.limit }
            );

            // A dead row means a tuple the database believes in will never
            // reach OpenFGA — someone has to look at it, so it is not `info`.
            if (dead > 0) {
                logger.error({ jobId: job.id, dead }, "fga outbox: rows dead-lettered");
            }
            // Quiet when idle — this runs every second.
            if (processed > 0) {
                logger.info(
                    { jobId: job.id, processed, done, failed, dead },
                    "fga outbox: drained"
                );
            }
            return { processed, done, failed, dead };
        },
        {
            connection: redisConnectionOptions,
            // The drain is already batched and claims rows with SKIP LOCKED;
            // parallel jobs would only contend for the same rows.
            concurrency: 1,
        }
    );

    worker.on("failed", (job, err) => {
        logger.error({ jobId: job?.id, err }, "fga outbox: drain failed");
    });

    return worker;
};
