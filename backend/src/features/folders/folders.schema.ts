import { z } from "zod";

const NAME_MIN_LENGTH = 1;
const NAME_MAX_LENGTH = 255;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// POST /api/v1/folders
export const folderCreateSchema = z
    .object({
        name: z
            .string()
            .trim()
            .min(NAME_MIN_LENGTH, "name is required")
            .max(NAME_MAX_LENGTH, `name must be at most ${NAME_MAX_LENGTH} characters`),
        // null/absent = root folder.
        parentId: z.string().uuid("parentId must be a valid UUID").nullable().optional(),
    })
    .strict();

// GET /api/v1/folders — cursor pagination only.
export const folderListSchema = z
    .object({
        parentId: z.string().uuid("parentId must be a valid UUID").optional(),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    })
    .strict();

// PATCH /api/v1/folders/:id — rename.
export const folderRenameSchema = z
    .object({
        name: z
            .string()
            .trim()
            .min(NAME_MIN_LENGTH, "name is required")
            .max(NAME_MAX_LENGTH, `name must be at most ${NAME_MAX_LENGTH} characters`),
    })
    .strict();

// PATCH /api/v1/folders/:id/move — reparent (null = move to root).
export const folderMoveSchema = z
    .object({
        parentId: z.string().uuid("parentId must be a valid UUID").nullable(),
    })
    .strict();

// Shared path param for folder mutations.
export const folderIdParamSchema = z
    .object({
        id: z.string().uuid("id must be a valid UUID"),
    })
    .strict();

export type FolderCreateInput = z.infer<typeof folderCreateSchema>;
export type FolderListQuery = z.infer<typeof folderListSchema>;
export type FolderRenameInput = z.infer<typeof folderRenameSchema>;
export type FolderMoveInput = z.infer<typeof folderMoveSchema>;
export type FolderIdParam = z.infer<typeof folderIdParamSchema>;
