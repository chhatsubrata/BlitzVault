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
