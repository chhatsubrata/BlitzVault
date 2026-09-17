import "reflect-metadata";
import AppDataSource from "../config/db";
import { logger } from "../shared/utils/logger";
import {
    createFgaOutboxWorker,
    fgaOutboxQueue,
    scheduleOutboxDrain,
} from "./fga/outbox.worker";
import { scanQueue, createScanWorker } from "./scan/scan.worker";

/**
 * Worker process entrypoint. Long-running (unlike the Week 1 demo spike): boots
 * every BullMQ consumer and drains on SIGINT/SIGTERM. Run: `pnpm worker:dev`.
 *
 * Consumers: AV scan (Phase 1) and the `fga_outbox` drain (Phase 2).
 * Thumbnails run on Cloudinary on-delivery (no queue).
 *
 * The outbox drain reads Postgres, so this process owns a DataSource — the API
 * and the worker each initialise their own.
 */

const queues = [scanQueue, fgaOutboxQueue];
let workers: Array<{ close: () => Promise<void> }> = [];

const start = async (): Promise<void> => {
    await AppDataSource.initialize();

    workers = [createScanWorker(), createFgaOutboxWorker()];
    await scheduleOutboxDrain();

    logger.info({ queues: Object.values(queues).map((q) => q.name) }, "worker process started");
};

let shuttingDown = false;

const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "worker process draining");
    try {
        await Promise.all(workers.map((worker) => worker.close()));
        await Promise.all(queues.map((queue) => queue.close()));
        if (AppDataSource.isInitialized) {
            await AppDataSource.destroy();
        }
        logger.info("worker process stopped cleanly");
        process.exit(0);
    } catch (err) {
        logger.error({ err }, "worker process failed to drain");
        process.exit(1);
    }
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

start().catch((err) => {
    logger.error({ err }, "worker process failed to start");
    process.exit(1);
});
