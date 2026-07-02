import "reflect-metadata";
import { logger } from "../shared/utils/logger";
import { scanQueue, createScanWorker } from "./scan/scan.worker";

/**
 * Worker process entrypoint. Long-running (unlike the Week 1 demo spike): boots
 * every BullMQ consumer and drains on SIGINT/SIGTERM. Run: `pnpm worker:dev`.
 *
 * Phase 1 consumers: AV scan. Thumbnails run on Cloudinary on-delivery (no
 * queue). `fga_outbox` drain lands in Phase 2.
 */

const workers = [createScanWorker()];

logger.info({ queues: ["scan"] }, "worker process started");

let shuttingDown = false;

const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "worker process draining");
    try {
        await Promise.all(workers.map((worker) => worker.close()));
        await scanQueue.close();
        logger.info("worker process stopped cleanly");
        process.exit(0);
    } catch (err) {
        logger.error({ err }, "worker process failed to drain");
        process.exit(1);
    }
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
