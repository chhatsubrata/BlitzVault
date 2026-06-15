import "reflect-metadata";
import { Queue, Worker, Job } from "bullmq";
import { redisConnectionOptions } from "../shared/config/redis";
import { logger } from "../shared/utils/logger";

/**
 * BullMQ harness spike (Week 1 Dev3). Proves enqueue -> process -> ack against
 * the local Redis. NOT the real worker pool — Phase 1 adds thumbnail/scan/
 * fga_outbox processors. Run standalone: `pnpm worker:dev`.
 */

const QUEUE_NAME = "demo";

type DemoJobData = {
    hello: string;
    at: number;
};

type DemoJobResult = {
    ok: true;
    processedAt: number;
};

const queue = new Queue<DemoJobData, DemoJobResult>(QUEUE_NAME, {
    connection: redisConnectionOptions,
});

const worker = new Worker<DemoJobData, DemoJobResult>(
    QUEUE_NAME,
    async (job: Job<DemoJobData, DemoJobResult>): Promise<DemoJobResult> => {
        logger.info({ jobId: job.id, name: job.name, data: job.data }, "processing job");
        return { ok: true, processedAt: job.timestamp };
    },
    { connection: redisConnectionOptions }
);

const shutdown = async (code: number): Promise<void> => {
    await worker.close();
    await queue.close();
    process.exit(code);
};

worker.on("completed", (job, result) => {
    logger.info({ jobId: job.id, result }, "job completed");
    void shutdown(0);
});

worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "job failed");
    void shutdown(1);
});

const main = async (): Promise<void> => {
    // Timestamp passed in (Date.now at call site is fine in a one-shot script).
    const job = await queue.add("demo-job", { hello: "blitzvault", at: Date.now() });
    logger.info({ jobId: job.id }, "job enqueued");
};

main().catch((err) => {
    logger.error({ err }, "worker harness failed to start");
    void shutdown(1);
});
