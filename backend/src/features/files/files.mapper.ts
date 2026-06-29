import { Files, FileStatus } from "../../entities/Files";
import { createStorageAdapter } from "../../shared/services/storage";

/**
 * Client-facing file shape (camelCase; internal columns omitted). `sizeBytes`
 * stays a string — `size_bytes` is a Postgres bigint (mapped to string by
 * TypeORM) and may exceed JS safe-integer range for large files.
 */
export type FileResponse = {
    id: string;
    folderId: string;
    name: string;
    sizeBytes: string;
    mime: string;
    status: FileStatus;
    thumbnailUrl: string | null;
    createdAt: string;
    updatedAt: string;
};

// Derived thumbnail URL for previewable types (images + PDF first page).
const isPreviewable = (mime: string): boolean =>
    mime.startsWith("image/") || mime === "application/pdf";

const thumbnailUrlFor = (file: Files): string | null =>
    isPreviewable(file.mime)
        ? createStorageAdapter().getThumbnailUrl(file.storage_key, file.mime)
        : null;

export const toFileResponse = (file: Files): FileResponse => ({
    id: file.id,
    folderId: file.folder_id,
    name: file.name,
    sizeBytes: file.size_bytes,
    mime: file.mime,
    status: file.status,
    thumbnailUrl: thumbnailUrlFor(file),
    createdAt: file.created_at.toISOString(),
    updatedAt: file.updated_at.toISOString(),
});
