import { Job, Queue, Worker } from "bullmq";

import AppDataSource from "../../config/db";
import { redisConnectionOptions } from "../../shared/config/redis";
import { drainOutbox, getAuthorizationService } from "../../shared/services/authz";
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

export const fgaOutboxQueue = new Queue<FgaOutboxJobData, FgaOutboxJobResult>(
    QUEUE_NAMES.fgaOutbox,
    {
        connection: redisConnectionOptions,
        defaultJobOptions: {
            attempts: 3,
            backoff: { type: "exponential", delay: 1_000 },
            removeOnComplete: 100,
            removeOnFail: 1_000,
        },
    }
);

/** Nudge the drain after a tuple write instead of waiting for the next tick. */
export const enqueueOutboxDrain = (data: FgaOutboxJobData = {}) =>
    fgaOutboxQueue.add(FGA_OUTBOX_JOB_NAME, data);

/**
 * Register the repeating drain. Keyed by job id so restarts reuse the one
 * schedule rather than stacking duplicates.
 */
export const scheduleOutboxDrain = () =>
    fgaOutboxQueue.add(
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
            const { processed, done, failed } = await drainOutbox(
                { authz: getAuthorizationService(), ds: AppDataSource },
                { limit: job.data.limit }
            );

            // Quiet when idle — this runs every second.
            if (processed > 0) {
                logger.info({ jobId: job.id, processed, done, failed }, "fga outbox: drained");
            }
            return { processed, done, failed };
        },
        { connection: redisConnectionOptions }
    );

    worker.on("failed", (job, err) => {
        logger.error({ jobId: job?.id, err }, "fga outbox: drain failed");
    });

    return worker;
};
