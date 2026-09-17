import { Files, FileStatus } from "../../entities/Files";
import type { AccessRole, ItemAccess, SharePermissions } from "../../shared/services/authz";
import { createStorageAdapter } from "../../shared/services/storage";

/**
 * Client-facing file shape (camelCase; internal columns omitted). `sizeBytes`
 * stays a string — `size_bytes` is a Postgres bigint (mapped to string by
 * TypeORM) and may exceed JS safe-integer range for large files.
 *
 * `accessRole`/`permissions` are optional because single-resource responses
 * (upload, rename) are already gated by `authorize()` and have nothing to add;
 * list responses carry them so the grid can disable actions it would be told
 * off for attempting.
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
    accessRole?: AccessRole;
    permissions?: SharePermissions;
};

// Derived thumbnail URL for previewable types (images + PDF first page).
const isPreviewable = (mime: string): boolean =>
    mime.startsWith("image/") || mime === "application/pdf";

const thumbnailUrlFor = (file: Files): string | null =>
    isPreviewable(file.mime)
        ? createStorageAdapter().getThumbnailUrl(file.storage_key, file.mime)
        : null;

export const toFileResponse = (file: Files, access?: ItemAccess): FileResponse => ({
    id: file.id,
    folderId: file.folder_id,
    name: file.name,
    sizeBytes: file.size_bytes,
    mime: file.mime,
    status: file.status,
    thumbnailUrl: thumbnailUrlFor(file),
    createdAt: file.created_at.toISOString(),
    updatedAt: file.updated_at.toISOString(),
    ...(access
        ? { accessRole: access.accessRole, permissions: access.permissions }
        : {}),
});
