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
    findDeletedFilesPage,
    findFilesPage,
    findOwnedDeletedFiles,
    findOwnerIdByClerkId,
    folderExistsForOwner,
    findOwnedFileById,
    markFileReady,
    restoreFiles,
    softDeleteFiles,
} from "./files.repository";
import { FileResponse, toFileResponse } from "./files.mapper";
import {
    FileListInFolderQuery,
    FileRestoreInput,
    FileTrashListQuery,
    FileUploadCompleteInput,
    FileUploadInitInput,
} from "./files.schema";
import { decodeCursor, encodeCursor } from "../../shared/pagination/cursor";

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
        object = await createStorageAdapter().completeUpload(file.storage_key, file.mime);
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

/**
 * Issue a time-limited presigned download URL for a file the caller owns. Only
 * `ready` files are downloadable — a pending/failed upload has no verified
 * object in storage yet.
 */
export const downloadFileService = async (
    clerkUserId: string,
    fileId: string,
    expiresInSeconds: number
): Promise<{ downloadUrl: string }> => {
    const ownerId = await resolveOwnerId(clerkUserId);

    const file = await findOwnedFileById(ownerId, fileId);
    if (!file) {
        throw new NotFoundError("File not found.");
    }
    if (file.status !== "ready") {
        throw new ConflictError("File is not ready for download.");
    }

    const downloadUrl = await createStorageAdapter().getPresignedDownload(
        file.storage_key,
        expiresInSeconds,
        file.mime
    );

    return { downloadUrl };
};

export type DeleteFileResult = { id: string; deleted: true };

/**
 * Soft-delete a file the caller owns. Keeps the storage object intact so the
 * file can be restored from trash — hard delete is a separate admin path.
 */
export const deleteFileService = async (
    clerkUserId: string,
    fileId: string
): Promise<DeleteFileResult> => {
    const ownerId = await resolveOwnerId(clerkUserId);

    const file = await findOwnedFileById(ownerId, fileId);
    if (!file) {
        throw new NotFoundError("File not found.");
    }

    await softDeleteFiles([fileId]);
    return { id: fileId, deleted: true };
};

export type RestoreFilesResult = { count: number; restored: true };

/**
 * Restore soft-deleted files (single or bulk) the caller owns. All ids must
 * reference the caller's currently-deleted files; a partial/foreign set is a
 * 404 and nothing is restored.
 */
export const restoreFilesService = async (
    clerkUserId: string,
    input: FileRestoreInput
): Promise<RestoreFilesResult> => {
    const ownerId = await resolveOwnerId(clerkUserId);

    // Dedupe so a repeated id can't inflate the count past the match check.
    const ids = [...new Set(input.ids)];

    const files = await findOwnedDeletedFiles(ownerId, ids);
    if (files.length !== ids.length) {
        throw new NotFoundError("Some files were not found or are not deleted.");
    }

    await restoreFiles(ids);
    return { count: ids.length, restored: true };
};

export type FileListResult = {
    files: FileResponse[];
    nextCursor: string | null;
};

/**
 * List the caller's live files directly inside a folder, cursor-paginated.
 * Mirrors the folder listing: an unsynced user gets an empty page, an unknown
 * or foreign folder is a 404.
 */
export const listFilesInFolderService = async (
    clerkUserId: string,
    query: FileListInFolderQuery
): Promise<FileListResult> => {
    const ownerId = await findOwnerIdByClerkId(clerkUserId);
    if (!ownerId) {
        return { files: [], nextCursor: null };
    }

    const folderOk = await folderExistsForOwner(ownerId, query.folderId);
    if (!folderOk) {
        throw new NotFoundError("Folder not found.");
    }

    const rows = await findFilesPage({
        ownerId,
        folderId: query.folderId,
        limit: query.limit,
        cursor: decodeCursor(query.cursor),
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];

    return {
        files: page.map(toFileResponse),
        nextCursor:
            hasMore && last
                ? encodeCursor({ createdAt: last.created_at.toISOString(), id: last.id })
                : null,
    };
};

/**
 * List the caller's soft-deleted files (the trash), newest-deletion-first,
 * cursor-paginated. Unsynced user -> empty trash. The cursor is keyed on
 * `deleted_at` (never null for these rows).
 */
export const listTrashService = async (
    clerkUserId: string,
    query: FileTrashListQuery
): Promise<FileListResult> => {
    const ownerId = await findOwnerIdByClerkId(clerkUserId);
    if (!ownerId) {
        return { files: [], nextCursor: null };
    }

    const rows = await findDeletedFilesPage({
        ownerId,
        limit: query.limit,
        cursor: decodeCursor(query.cursor),
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];

    return {
        files: page.map(toFileResponse),
        nextCursor:
            hasMore && last && last.deleted_at
                ? encodeCursor({ createdAt: last.deleted_at.toISOString(), id: last.id })
                : null,
    };
};
