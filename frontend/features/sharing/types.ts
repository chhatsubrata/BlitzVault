import { z } from "zod";

/**
 * Phase 2 sharing contract, mirrored from the backend (frozen Week 3 Monday,
 * commit eb4315b). Source of truth:
 *   backend/src/shared/openapi/document.ts
 *     — components SharePermissions, SharePrincipal, ShareGrant,
 *       SharePublicLink, SharedWith
 *   docs/api-guidelines.md  — "Sharing &amp; permission envelope (Phase 2)"
 *   docs/openfga-model.md   — the relations behind the permission keys
 * Repo is split pnpm workspaces (no shared package yet) — keep these in sync.
 *
 * Convention (see features/drive/types.ts): request inputs are Zod + z.infer,
 * response shapes are hand-written TS.
 */

/** Grantable roles. Owner is implicit and is never listed as a grant. */
export const SHARE_ROLES = ["editor", "viewer"] as const;

/**
 * Badge domain. FE-ONLY — not a wire type. Kept separate from ShareRole so that
 * "owner" is never mistaken for something grantable, and so the gap below stays
 * visible in the types rather than hidden inside a helper.
 */
export const ACCESS_ROLES = ["owner", "editor", "viewer"] as const;

/** A public link grants `viewer` only — the model defines no editor link. */
export const PUBLIC_LINK_ROLES = ["viewer"] as const;

const EMAIL_MAX = 320;

// --- Response shapes (1:1 with the frozen OpenAPI components) ---------------

/**
 * The caller's own effective relations, resolved via OpenFGA `check`. Keys map
 * 1:1 to model relations (canRead -> can_read, ...); an absent relation is
 * false (deny-by-default).
 *
 * NOTE: this object cannot distinguish owner from editor — for `file`,
 * can_write / can_share / can_delete are all "owner or editor", so both roles
 * produce an identical object. The owner/editor/viewer badge therefore cannot
 * be derived from it; see AccessRole and features/sharing/permissions.ts.
 */
export type SharePermissions = {
    canRead: boolean;
    canWrite: boolean;
    canShare: boolean;
    canDelete: boolean;
};

/** `team` grants land later; the model already supports `team#member`. */
export type SharePrincipalType = "user" | "team";

export type SharePrincipal = {
    type: SharePrincipalType;
    id: string;
    // Optional in the OpenAPI component — not every principal resolves to one.
    email?: string;
    // Clerk account photo; null when the account has none (the UI then draws
    // initials). Additive optional field on the frozen component.
    avatarUrl?: string | null;
};

export type ShareRole = (typeof SHARE_ROLES)[number];

export type ShareGrant = {
    principal: SharePrincipal;
    role: ShareRole;
};

export type SharePublicLinkRole = (typeof PUBLIC_LINK_ROLES)[number];

export type SharePublicLink = {
    token: string;
    role: SharePublicLinkRole;
    url: string;
};

/**
 * Who a resource is shared with. `publicLink` is optional in the component AND
 * nullable (oneOf [SharePublicLink, null]), so both undefined and null are
 * legal on the wire — callers must handle each.
 */
export type SharedWith = {
    grants: ShareGrant[];
    publicLink?: SharePublicLink | null;
};

/**
 * One row of the member-picker typeahead (`GET /users/search`). Only what the
 * picker renders — the endpoint deliberately withholds the Clerk id.
 */
export type MemberSuggestion = {
    id: string;
    email: string;
    username: string;
    avatarUrl: string | null;
};

// --- FE-side helpers --------------------------------------------------------

export type ShareResourceKind = "file" | "folder";

/** Addresses a shareable resource; keeps api.ts free of string building. */
export type ShareResourceRef = {
    kind: ShareResourceKind;
    id: string;
};

/**
 * The caller's role on a resource, as displayed by PermissionBadge. FE-ONLY —
 * no endpoint returns this yet. Pending a contract change request to add an
 * `accessRole` field alongside `permissions` on the resource envelope; until
 * then callers pass STATIC_ACCESS_ROLE (features/sharing/permissions.ts).
 */
export type AccessRole = (typeof ACCESS_ROLES)[number];

// --- Request schemas --------------------------------------------------------

/**
 * Mirrors backend/src/features/sharing/sharing.schema.ts — these started as the
 * frontend's proposal and the endpoints shipped against them unchanged.
 *
 * Grants are keyed by `email`, not by `principal: { type, id }`: sharing is
 * by email with no user-directory search, so the FE never holds a user id
 * before the first grant. Revoke takes an id because by then the grant list
 * came back from the server.
 */
export const shareGrantCreateSchema = z
    .object({
        email: z.string().trim().toLowerCase().email().max(EMAIL_MAX),
        role: z.enum(SHARE_ROLES),
    })
    .strict();

export const shareGrantRevokeSchema = z
    .object({
        principalId: z.string().min(1),
    })
    .strict();

export type ShareGrantCreateInput = z.infer<typeof shareGrantCreateSchema>;
export type ShareGrantRevokeInput = z.infer<typeof shareGrantRevokeSchema>;
