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
