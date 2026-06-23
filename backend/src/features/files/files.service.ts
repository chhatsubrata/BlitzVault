import { randomUUID } from "crypto";

import { env } from "../../shared/config/env";
import {
    ConflictError,
    NotFoundError,
    QuotaExceededError,
    UnauthenticatedError,
    UpstreamError,
    ValidationError,
} from "../../shared/errors/AppError";
import { createStorageAdapter } from "../../shared/services/storage";
import { StorageAdapterError } from "../../shared/services/storage/types";
import {
    readIdempotent,
    writeIdempotent,
} from "../../shared/services/idempotency";
import {
    createPendingFile,
    findOwnerIdByClerkId,
    folderExistsForOwner,
    findOwnedFileById,
    markFileReady,
} from "./files.repository";
import { FileResponse, toFileResponse } from "./files.mapper";
import { FileUploadCompleteInput, FileUploadInitInput } from "./files.schema";

const IDEMPOTENCY_SCOPE = "upload-init";

/** Presigned upload target returned to the client by /upload/init. */
export type UploadInitResult = {
    fileId: string;
    upload: {
        url: string;
        method: "PUT" | "POST";
        headers: Record<string, string>;
        fields?: Record<string, string>;
        key: string;
        expiresAt: number;
    };
};

const resolveOwnerId = async (clerkUserId: string): Promise<string> => {
    const ownerId = await findOwnerIdByClerkId(clerkUserId);
    if (!ownerId) {
        // Valid JWT but no local user row yet — client must sync first.
        throw new UnauthenticatedError("User is not provisioned. Sync your account first.");
    }
    return ownerId;
};

const toChecksumBuffer = (hex?: string): Buffer | null =>
    hex ? Buffer.from(hex, "hex") : null;

/**
 * Reserves a file: validates the target folder + size, signs a direct-to-storage
 * upload, and writes a `pending` File row. Idempotent per (owner, Idempotency-Key)
 * so a retried request returns the original presigned target and fileId.
 */
export const initUploadService = async (
    clerkUserId: string,
    idempotencyKey: string,
    input: FileUploadInitInput
): Promise<UploadInitResult> => {
    const ownerId = await resolveOwnerId(clerkUserId);

    const cached = await readIdempotent<UploadInitResult>(
        IDEMPOTENCY_SCOPE,
        ownerId,
        idempotencyKey
    );
    if (cached) {
        return cached;
    }

    const folderOk = await folderExistsForOwner(ownerId, input.folderId);
    if (!folderOk) {
        throw new NotFoundError("Folder not found.");
    }

    if (input.sizeBytes > env.MAX_FILE_SIZE_BYTES) {
        throw new QuotaExceededError(
            `File exceeds the maximum allowed size of ${env.MAX_FILE_SIZE_BYTES} bytes.`
        );
    }

    const fileId = randomUUID();
    const storageKey = `users/${ownerId}/${fileId}`;

    const presigned = await createStorageAdapter().createPresignedUpload({
        key: storageKey,
        sizeBytes: input.sizeBytes,
        contentType: input.mime,
        checksumSha256: input.checksumSha256,
    });

    await createPendingFile({
        id: fileId,
        ownerId,
        folderId: input.folderId,
        name: input.name,
        sizeBytes: input.sizeBytes,
        mime: input.mime,
        storageKey,
        storageProvider: env.STORAGE_DRIVER,
        checksumSha256: toChecksumBuffer(input.checksumSha256),
    });

    const result: UploadInitResult = {
        fileId,
        upload: {
            url: presigned.url,
            method: presigned.method,
            headers: presigned.headers,
            fields: presigned.fields,
            key: presigned.key,
            expiresAt: presigned.expiresAt,
        },
    };

    await writeIdempotent(
        IDEMPOTENCY_SCOPE,
        ownerId,
        idempotencyKey,
        result,
        env.UPLOAD_IDEMPOTENCY_TTL_SECONDS
    );

    return result;
};

/**
 * Finalizes an upload: verifies the object landed in storage, optionally checks
 * the checksum declared at init, and flips the row to `ready`. Idempotent — a
 * second call on an already-ready file returns its current metadata.
 */
export const completeUploadService = async (
    clerkUserId: string,
    input: FileUploadCompleteInput
): Promise<FileResponse> => {
    const ownerId = await resolveOwnerId(clerkUserId);

    const file = await findOwnedFileById(ownerId, input.fileId);
    if (!file) {
        throw new NotFoundError("File not found.");
    }

    // Already finalized — return current metadata (idempotent complete).
    if (file.status === "ready") {
        return toFileResponse(file);
    }

    let object;
    try {
        object = await createStorageAdapter().completeUpload(file.storage_key);
    } catch (error) {
        if (error instanceof StorageAdapterError && error.statusCode === 404) {
            // Object isn't in storage yet — the client hasn't finished the PUT.
            throw new ConflictError(
                "Uploaded object not found in storage. Upload the file before completing."
            );
        }
        throw new UpstreamError(
            error instanceof Error ? error.message : "Storage verification failed."
        );
    }

    if (input.checksumSha256 && file.checksum_sha256) {
        const declared = file.checksum_sha256.toString("hex").toLowerCase();
        if (declared !== input.checksumSha256.toLowerCase()) {
            throw new ValidationError(
                undefined,
                "Checksum mismatch between init and complete."
            );
        }
    }

    const ready = await markFileReady(file, object.sizeBytes);
    return toFileResponse(ready);
};
