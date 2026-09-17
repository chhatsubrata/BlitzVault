import { z } from "zod";

/**
 * Public-link contracts (Week 3 Thu).
 *
 * The create body is deliberately empty: expiry and password protection have
 * columns (migration 0007) but no agreed request shape yet, and the frontend
 * stub (features/sharing/components/share-public-link-row.tsx) states as much.
 * `.strict()` means a client that starts sending `{ expiresAt }` gets a 400
 * rather than silent acceptance of an option nothing honours.
 */

// 32 random bytes as base64url — always 43 chars. The bounds are generous
// either side so a future token length is not a breaking change, while still
// rejecting the obviously-wrong (a UUID, an empty string, a pasted URL).
const TOKEN_MIN = 20;
const TOKEN_MAX = 64;

export const linkTokenParamSchema = z
    .object({
        token: z
            .string()
            .min(TOKEN_MIN)
            .max(TOKEN_MAX)
            .regex(/^[A-Za-z0-9_-]+$/, "malformed token"),
    })
    .strict();

export const publicLinkCreateSchema = z.object({}).strict();

export type LinkTokenParam = z.infer<typeof linkTokenParamSchema>;
export type PublicLinkCreateInput = z.infer<typeof publicLinkCreateSchema>;
