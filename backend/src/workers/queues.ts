/**
 * BullMQ queue registry. One source of truth for queue names + job payload
 * shapes shared between producers (API) and consumers (worker process).
 *
 * Phase 1 lands the `scan` queue (AV stub). Thumbnails run on Cloudinary
 * on-delivery (no queue); `fga_outbox` drain arrives in Phase 2.
 */

export const QUEUE_NAMES = {
    scan: "scan",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/**
 * AV scan job. Enqueued after `/files/upload/complete` writes the row; the
 * worker resolves the object by `storageKey` and marks the file clean/infected.
 */
export type ScanJobData = {
    fileId: string;
    storageKey: string;
    // Bytes are fetched from storage inside the worker (not passed on the queue).
    // Optional size hint for logging / future max-scan-size guards.
    sizeBytes?: number;
};

export type ScanStatus = "clean" | "infected" | "skipped";

export type ScanJobResult = {
    fileId: string;
    status: ScanStatus;
    // Which engine produced the verdict: `stub` (disabled) or `clamd`.
    engine: "stub" | "clamd";
    // Matched signature name when status is `infected`.
    signature?: string;
    note?: string;
};

export const SCAN_JOB_NAME = "av-scan";
