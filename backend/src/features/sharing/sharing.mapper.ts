/**
 * Tuples + user rows -> the frozen `shared` envelope (docs/api-guidelines.md →
 * "Sharing & permission envelope"; components SharedWith / ShareGrant /
 * SharePrincipal in shared/openapi/document.ts).
 */
import type { TupleKey } from "../../shared/services/authz";
import type { ShareRole } from "./sharing.schema";

export type SharePrincipal = {
    type: "user" | "team";
    id: string;
    email?: string;
    /** Clerk photo when the account has one; the UI draws initials otherwise. */
    avatarUrl?: string | null;
};

export type ShareGrant = {
    principal: SharePrincipal;
    role: ShareRole;
};

export type SharePublicLink = {
    token: string;
    role: "viewer";
    url: string;
};

export type SharedWith = {
    grants: ShareGrant[];
    publicLink: SharePublicLink | null;
};

/** `user:<uuid>` -> `<uuid>`; anything else (team#member, public_link#accessor). */
export const parsePrincipal = (subject: string): SharePrincipal | null => {
    const [type, rest] = subject.split(":", 2);
    if (!rest) return null;

    if (type === "user") {
        // `user:*` is the public-link wildcard, never a listed grant.
        return rest === "*" ? null : { type: "user", id: rest };
    }
    if (type === "team") {
        // `team:<id>#member` — the grant is the team, not the userset.
        return { type: "team", id: rest.split("#")[0] };
    }
    return null;
};

/** What a share row shows about a person, resolved from the users table. */
export type PrincipalProfile = {
    email: string;
    avatarUrl: string | null;
};

/**
 * Build the envelope from grant tuples. `profiles` hydrates user principals; a
 * principal with no matching row (deleted user) keeps its id and omits the
 * profile rather than disappearing, so the owner can still revoke it.
 */
export const toSharedWith = (
    tuples: TupleKey[],
    profiles: Map<string, PrincipalProfile>,
    publicLink: SharePublicLink | null = null
): SharedWith => {
    // One grant per principal: a role swap can briefly leave both tuples
    // visible, and the stronger role is the effective one.
    const byPrincipal = new Map<string, ShareGrant>();

    for (const tuple of tuples) {
        if (tuple.relation !== "editor" && tuple.relation !== "viewer") continue;

        const principal = parsePrincipal(tuple.user);
        if (!principal) continue;

        const role = tuple.relation as ShareRole;
        const key = `${principal.type}:${principal.id}`;
        const existing = byPrincipal.get(key);
        if (existing && existing.role === "editor") continue;

        const profile =
            principal.type === "user" ? profiles.get(principal.id) : undefined;
        byPrincipal.set(key, {
            principal: profile
                ? { ...principal, email: profile.email, avatarUrl: profile.avatarUrl }
                : principal,
            role,
        });
    }

    return {
        grants: [...byPrincipal.values()].sort((a, b) =>
            (a.principal.email ?? a.principal.id).localeCompare(
                b.principal.email ?? b.principal.id
            )
        ),
        // Resolved from `share_links` by the caller, not from the tuples: the
        // wildcard accessor tuple says a link exists but not what its token is.
        publicLink,
    };
};
