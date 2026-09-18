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
    // Member search is resource-independent: the same term caches once for
    // every dialog, and a grant never needs to invalidate it.
    memberSearch: (term: string) => ["sharing", "member-search", term] as const,
    // Public-link resolution, keyed by token. Cannot collide with resource():
    // position 1 there is always "file" | "folder".
    link: (token: string) => ["sharing", "link", token] as const,
};
