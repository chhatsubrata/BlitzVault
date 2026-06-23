import { Files, FileStatus } from "../../entities/Files";

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
    createdAt: string;
    updatedAt: string;
};

export const toFileResponse = (file: Files): FileResponse => ({
    id: file.id,
    folderId: file.folder_id,
    name: file.name,
    sizeBytes: file.size_bytes,
    mime: file.mime,
    status: file.status,
    createdAt: file.created_at.toISOString(),
    updatedAt: file.updated_at.toISOString(),
});
