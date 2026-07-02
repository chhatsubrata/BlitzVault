import net from "net";
import { env } from "../../shared/config/env";
import { logger } from "../../shared/utils/logger";
import type { ScanJobData, ScanJobResult } from "../queues";

/**
 * ClamAV (clamd) client — talks the native clamd TCP protocol directly so we
 * pull in no extra dependency. Two commands are wired:
 *
 *   PING      → liveness probe (expects `PONG`).
 *   INSTREAM  → stream bytes, get `stream: OK` / `... FOUND`.
 *
 * clamd framing: `z<COMMAND>\0` (null-terminated). INSTREAM chunks are a
 * 4-byte big-endian length prefix + payload, terminated by a zero-length chunk.
 *
 * NOTE (Phase 1 stub): when `CLAMAV_ENABLED=false` (default) no daemon exists,
 * so `scan()` short-circuits to `clean` with engine `stub`. When enabled the
 * worker still only PINGs clamd for now — fetching the object bytes from the
 * storage adapter and running INSTREAM per file is wired in a later phase.
 * `scanBuffer` below is the real path, kept ready + unit-testable meanwhile.
 */

const CHUNK_SIZE = 64 * 1024;

const connect = (): Promise<net.Socket> =>
    new Promise((resolve, reject) => {
        const socket = net.createConnection({
            host: env.CLAMAV_HOST,
            port: env.CLAMAV_PORT,
        });
        socket.setTimeout(env.CLAMAV_TIMEOUT_MS);
        socket.once("connect", () => resolve(socket));
        socket.once("timeout", () => {
            socket.destroy();
            reject(new Error("clamd connection timed out"));
        });
        socket.once("error", reject);
    });

const readReply = (socket: net.Socket): Promise<string> =>
    new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        socket.on("data", (chunk: Buffer) => chunks.push(chunk));
        socket.once("end", () =>
            resolve(Buffer.concat(chunks).toString("utf8").replace(/\0$/, "").trim())
        );
        socket.once("timeout", () => {
            socket.destroy();
            reject(new Error("clamd read timed out"));
        });
        socket.once("error", reject);
    });

/** Liveness probe. Resolves true only when clamd answers `PONG`. */
export const pingClamd = async (): Promise<boolean> => {
    const socket = await connect();
    try {
        socket.write("zPING\0");
        const reply = await readReply(socket);
        return reply === "PONG";
    } finally {
        socket.destroy();
    }
};

/**
 * Real INSTREAM scan of an in-memory buffer. Returns the parsed verdict.
 * Used by tests today and by the per-file scan path once storage fetch lands.
 */
export const scanBuffer = async (buffer: Buffer): Promise<{ status: "clean" | "infected"; signature?: string }> => {
    const socket = await connect();
    const replyPromise = readReply(socket);
    try {
        socket.write("zINSTREAM\0");
        for (let offset = 0; offset < buffer.length; offset += CHUNK_SIZE) {
            const slice = buffer.subarray(offset, offset + CHUNK_SIZE);
            const header = Buffer.alloc(4);
            header.writeUInt32BE(slice.length, 0);
            socket.write(header);
            socket.write(slice);
        }
        // Zero-length chunk terminates the stream.
        socket.write(Buffer.from([0, 0, 0, 0]));

        const reply = await replyPromise;
        if (reply.endsWith("OK")) return { status: "clean" };
        const match = reply.match(/^stream:\s+(.*)\s+FOUND$/);
        if (match) return { status: "infected", signature: match[1] };
        throw new Error(`unexpected clamd reply: ${reply}`);
    } finally {
        socket.destroy();
    }
};

/**
 * Scan verdict for a queued file. This is the stub entrypoint the worker calls.
 * - Disabled: every file is treated as clean (engine `stub`).
 * - Enabled: prove clamd connectivity via PING and return clean (engine
 *   `clamd`). Per-file byte scanning via `scanBuffer` is wired in a later phase.
 */
export const scan = async (data: ScanJobData): Promise<ScanJobResult> => {
    if (!env.CLAMAV_ENABLED) {
        return {
            fileId: data.fileId,
            status: "clean",
            engine: "stub",
            note: "clamav disabled — file treated as clean (stub)",
        };
    }

    const alive = await pingClamd();
    if (!alive) {
        // Fail loudly so BullMQ retries rather than silently passing malware.
        throw new Error("clamd did not respond to PING");
    }

    logger.info({ fileId: data.fileId, storageKey: data.storageKey }, "clamd reachable — byte scan wiring deferred");
    return {
        fileId: data.fileId,
        status: "clean",
        engine: "clamd",
        note: "liveness verified; per-file byte scan wired in a later phase",
    };
};
