import { z } from "zod";

/**
 * Share request contracts (Week 3 Wed). Mirrors the frontend proposal in
 * frontend/features/sharing/types.ts — sharing is by email because the UI has
 * no user directory, so the client never holds a user id before the first
 * grant; revoke takes an id because by then the grant list came from the server.
 *
 * Response shapes are the frozen OpenAPI components (SharedWith, ShareGrant,
 * SharePrincipal) — see shared/openapi/document.ts.
 */

// RFC 5321 practical maximum; matches the FE schema.
const EMAIL_MAX = 320;

/** Grantable roles. `owner` is implicit and never a grant. */
export const SHARE_ROLES = ["editor", "viewer"] as const;
export type ShareRole = (typeof SHARE_ROLES)[number];

export const shareResourceIdParamSchema = z
    .object({
        id: z.string().uuid(),
    })
    .strict();

export const shareRevokeParamSchema = z
    .object({
        id: z.string().uuid(),
        principalId: z.string().uuid(),
    })
    .strict();

export const shareGrantCreateSchema = z
    .object({
        email: z.string().trim().toLowerCase().email().max(EMAIL_MAX),
        role: z.enum(SHARE_ROLES),
    })
    .strict();

export type ShareResourceIdParam = z.infer<typeof shareResourceIdParamSchema>;
export type ShareRevokeParam = z.infer<typeof shareRevokeParamSchema>;
export type ShareGrantCreateInput = z.infer<typeof shareGrantCreateSchema>;
