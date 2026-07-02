import { Queue, Worker, Job } from "bullmq";
import { redisConnectionOptions } from "../../shared/config/redis";
import { logger } from "../../shared/utils/logger";
import { QUEUE_NAMES, SCAN_JOB_NAME, type ScanJobData, type ScanJobResult } from "../queues";
import { scan } from "./av-scanner";

/**
 * AV scan queue + worker. The API enqueues a `ScanJobData` after upload
 * completes; this worker resolves a verdict via the clamd client (stubbed
 * clean while ClamAV is disabled — see av-scanner). Kept as its own module so
 * the process entrypoint and the CI smoke test share one wiring.
 */

/** Producer handle. Import this from the files service to enqueue scans. */
export const scanQueue = new Queue<ScanJobData, ScanJobResult>(QUEUE_NAMES.scan, {
    connection: redisConnectionOptions,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
    },
});

export const enqueueScan = (data: ScanJobData) =>
    scanQueue.add(SCAN_JOB_NAME, data);

/** Build (but do not implicitly start extra listeners on) the scan worker. */
export const createScanWorker = (): Worker<ScanJobData, ScanJobResult> => {
    const worker = new Worker<ScanJobData, ScanJobResult>(
        QUEUE_NAMES.scan,
        async (job: Job<ScanJobData, ScanJobResult>): Promise<ScanJobResult> => {
            logger.info({ jobId: job.id, fileId: job.data.fileId }, "av scan: start");
            const result = await scan(job.data);
            logger.info({ jobId: job.id, ...result }, "av scan: done");
            return result;
        },
        { connection: redisConnectionOptions }
    );

    worker.on("failed", (job, err) => {
        logger.error({ jobId: job?.id, fileId: job?.data.fileId, err }, "av scan: failed");
    });

    return worker;
};
