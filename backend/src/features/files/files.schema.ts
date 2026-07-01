import { z } from "zod";

const NAME_MIN_LENGTH = 1;
const NAME_MAX_LENGTH = 255;
const SHA256_HEX = /^[a-f0-9]{64}$/i;

// POST /api/v1/files/upload/init
// Idempotency-Key header is enforced at the route, not here.
export const fileUploadInitSchema = z
    .object({
        folderId: z.string().uuid("folderId must be a valid UUID"),
        name: z
            .string()
            .trim()
            .min(NAME_MIN_LENGTH, "name is required")
            .max(NAME_MAX_LENGTH, `name must be at most ${NAME_MAX_LENGTH} characters`),
        sizeBytes: z.number().int().positive("sizeBytes must be a positive integer"),
        mime: z.string().trim().min(1, "mime is required"),
        checksumSha256: z
            .string()
            .regex(SHA256_HEX, "checksumSha256 must be a 64-char hex sha256")
            .optional(),
    })
    .strict();

export type FileUploadInitInput = z.infer<typeof fileUploadInitSchema>;

// POST /api/v1/files/upload/complete
// Called after the client PUTs/POSTs the bytes to the presigned target. The
// server verifies the object landed in storage and flips the row to `ready`.
export const fileUploadCompleteSchema = z
    .object({
        fileId: z.string().uuid("fileId must be a valid UUID"),
        // Optional storage ETag echoed by the client (informational; not trusted).
        etag: z.string().trim().min(1).max(NAME_MAX_LENGTH).optional(),
        // Optional integrity re-check against the checksum declared at init.
        checksumSha256: z
            .string()
            .regex(SHA256_HEX, "checksumSha256 must be a 64-char hex sha256")
            .optional(),
    })
    .strict();

export type FileUploadCompleteInput = z.infer<typeof fileUploadCompleteSchema>;

// Shared `:id` param for download/delete.
export const fileIdParamSchema = z
    .object({
        id: z.string().uuid("id must be a valid UUID"),
    })
    .strict();

export type FileIdParam = z.infer<typeof fileIdParamSchema>;

// GET /api/v1/files/:id/download — optional signed-URL lifetime (1m–24h).
const DOWNLOAD_TTL_MIN_SECONDS = 60;
const DOWNLOAD_TTL_MAX_SECONDS = 86_400;
const DOWNLOAD_TTL_DEFAULT_SECONDS = 3600;

export const fileDownloadQuerySchema = z
    .object({
        expiresInSeconds: z.coerce
            .number()
            .int()
            .min(DOWNLOAD_TTL_MIN_SECONDS, "expiresInSeconds must be at least 60")
            .max(DOWNLOAD_TTL_MAX_SECONDS, "expiresInSeconds must be at most 86400")
            .default(DOWNLOAD_TTL_DEFAULT_SECONDS),
    })
    .strict();

export type FileDownloadQuery = z.infer<typeof fileDownloadQuerySchema>;

// POST /api/v1/files/restore — one endpoint serves single (one id) and bulk.
const RESTORE_MAX_IDS = 100;

export const fileRestoreSchema = z
    .object({
        ids: z
            .array(z.string().uuid("each id must be a valid UUID"))
            .min(1, "at least one id is required")
            .max(RESTORE_MAX_IDS, `at most ${RESTORE_MAX_IDS} ids per request`),
    })
    .strict();

export type FileRestoreInput = z.infer<typeof fileRestoreSchema>;

// GET /api/v1/files?folderId=… — cursor-paginated files within a folder.
const LIST_LIMIT_DEFAULT = 50;
const LIST_LIMIT_MAX = 100;

export const fileListInFolderSchema = z
    .object({
        folderId: z.string().uuid("folderId must be a valid UUID"),
        cursor: z.string().optional(),
        limit: z.coerce
            .number()
            .int()
            .min(1, "limit must be at least 1")
            .max(LIST_LIMIT_MAX, `limit must be at most ${LIST_LIMIT_MAX}`)
            .default(LIST_LIMIT_DEFAULT),
    })
    .strict();

export type FileListInFolderQuery = z.infer<typeof fileListInFolderSchema>;

// GET /api/v1/files/trash — cursor-paginated soft-deleted files (all folders).
export const fileTrashListSchema = z
    .object({
        cursor: z.string().optional(),
        limit: z.coerce
            .number()
            .int()
            .min(1, "limit must be at least 1")
            .max(LIST_LIMIT_MAX, `limit must be at most ${LIST_LIMIT_MAX}`)
            .default(LIST_LIMIT_DEFAULT),
    })
    .strict();

export type FileTrashListQuery = z.infer<typeof fileTrashListSchema>;
