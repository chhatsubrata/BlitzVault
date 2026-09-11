import type { ShareResourceKind } from "@/features/sharing/types";

/**
 * TanStack Query key factory for the sharing feature. Mirrors driveKeys.
 *
 * `resource` is a prefix level with no query of its own: a grant/revoke
 * invalidates everything cached for one file or folder in a single call,
 * without reaching for sharingKeys.all.
 */
export const sharingKeys = {
    all: ["sharing"] as const,
    resource: (kind: ShareResourceKind, id: string) =>
        ["sharing", kind, id] as const,
    shares: (kind: ShareResourceKind, id: string) =>
        ["sharing", kind, id, "shares"] as const,
};
