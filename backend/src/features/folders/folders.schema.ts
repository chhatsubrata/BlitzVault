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

export type FolderCreateInput = z.infer<typeof folderCreateSchema>;
export type FolderListQuery = z.infer<typeof folderListSchema>;
