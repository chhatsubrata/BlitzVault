import { z } from "zod";

/**
 * Request schemas mirrored from the backend Phase 1 contract (frozen, PR #17).
 * Source of truth:
 *   backend/src/features/folders/folders.schema.ts
 *   backend/src/features/files/files.schema.ts
 * Repo is split pnpm workspaces (no shared package yet) — keep these in sync.
 */

const NAME_MIN = 1;
const NAME_MAX = 255;
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;
const SHA256_HEX = /^[a-f0-9]{64}$/i;

export const folderCreateSchema = z
    .object({
        name: z.string().trim().min(NAME_MIN).max(NAME_MAX),
        parentId: z.string().uuid().nullable().optional(),
    })
    .strict();

export const folderListSchema = z
    .object({
        parentId: z.string().uuid().optional(),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    })
    .strict();

export const folderRenameSchema = z
    .object({
        name: z.string().trim().min(NAME_MIN).max(NAME_MAX),
    })
    .strict();

export const fileUploadInitSchema = z
    .object({
        folderId: z.string().uuid(),
        name: z.string().trim().min(NAME_MIN).max(NAME_MAX),
        sizeBytes: z.number().int().positive(),
        mime: z.string().trim().min(1),
        checksumSha256: z.string().regex(SHA256_HEX).optional(),
    })
    .strict();

export type FolderCreateInput = z.infer<typeof folderCreateSchema>;
export type FolderListQuery = z.infer<typeof folderListSchema>;
export type FolderRenameInput = z.infer<typeof folderRenameSchema>;
export type FileUploadInitInput = z.infer<typeof fileUploadInitSchema>;

/**
 * Response types — defined FE-side from the entities (camelCase). Backend has
 * no GET endpoint / response shape frozen yet; align when it ships.
 *   backend/src/entities/Folders.ts, backend/src/entities/Files.ts
 */
export type FileStatus = "pending" | "scanning" | "ready" | "infected" | "failed";

export type DriveFolder = {
    id: string;
    name: string;
    parentId: string | null;
    createdAt: string;
    updatedAt: string;
};

export type DriveFile = {
    id: string;
    name: string;
    folderId: string;
    // bigint on the backend -> string over the wire.
    sizeBytes: string;
    mime: string;
    status: FileStatus;
    createdAt: string;
    updatedAt: string;
};

export type DriveList = {
    folders: DriveFolder[];
    files: DriveFile[];
    nextCursor: string | null;
};

/** Breadcrumb entry (root -> self) from GET /folders/:id/path. */
export type FolderCrumb = {
    id: string;
    name: string;
};
