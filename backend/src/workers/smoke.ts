import "reflect-metadata";
import { QueueEvents } from "bullmq";
import { redisConnectionOptions } from "../shared/config/redis";
import { QUEUE_NAMES, type ScanJobResult } from "./queues";
import { scanQueue, enqueueScan, createScanWorker } from "./scan/scan.worker";

/**
 * Worker smoke test (CI: `pnpm run worker:smoke`). Proves the full loop against
 * a live Redis: enqueue an AV scan job -> worker processes it -> ack a `clean`
 * verdict. Runs with ClamAV disabled (the stub path), so it needs Redis only —
 * no clamd. Exits non-zero on any failure so CI blocks the merge.
 */

const TIMEOUT_MS = 20_000;

const main = async (): Promise<void> => {
    const worker = createScanWorker();
    const events = new QueueEvents(QUEUE_NAMES.scan, { connection: redisConnectionOptions });
    await events.waitUntilReady();
    await worker.waitUntilReady();

    const job = await enqueueScan({
        fileId: "smoke-file",
        storageKey: "smoke/smoke-file",
    });

    const timeout = new Promise<never>((_resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("smoke timed out")), TIMEOUT_MS);
        // Do not keep the event loop alive on the timer alone.
        timer.unref();
    });

    // `returnvalue` from QueueEvents is JSON — cast to the known result shape.
    const raw = await Promise.race([
        job.waitUntilFinished(events),
        timeout,
    ]);
    const result = raw as unknown as ScanJobResult;

    await worker.close();
    await events.close();
    await scanQueue.close();

    if (result.status !== "clean") {
        throw new Error(`expected clean verdict, got: ${JSON.stringify(result)}`);
    }

    console.log(`worker smoke OK: ${JSON.stringify(result)}`);
    process.exit(0);
};

main().catch((err) => {
    console.error("worker smoke FAILED:", err);
    process.exit(1);
});
