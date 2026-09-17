/**
 * BullMQ queue registry. One source of truth for queue names + job payload
 * shapes shared between producers (API) and consumers (worker process).
 *
 * Phase 1 lands the `scan` queue (AV stub). Thumbnails run on Cloudinary
 * on-delivery (no queue). Phase 2 adds `fga-outbox`, which drains tuple writes
 * to OpenFGA.
 */

export const QUEUE_NAMES = {
    scan: "scan",
    fgaOutbox: "fga-outbox",
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

/**
 * Outbox drain job. Carries no tuples: the rows are claimed from `fga_outbox`
 * by the worker itself, so a job is only a "there may be work" signal and two
 * overlapping jobs cannot process the same row (FOR UPDATE SKIP LOCKED).
 */
export type FgaOutboxJobData = {
    /** Max rows per pass; omitted means the drain default. */
    limit?: number;
};

export type FgaOutboxJobResult = {
    processed: number;
    done: number;
    failed: number;
};

export const FGA_OUTBOX_JOB_NAME = "fga-outbox-drain";

/** How often the repeatable job fires. Drain lag target is p95 < 2s. */
export const FGA_OUTBOX_POLL_MS = 1_000;
