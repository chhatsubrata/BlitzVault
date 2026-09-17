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

/**
 * Build the envelope from grant tuples. `emails` hydrates user principals; a
 * principal with no matching row (deleted user) keeps its id and omits email
 * rather than disappearing, so the owner can still revoke it.
 */
export const toSharedWith = (
    tuples: TupleKey[],
    emails: Map<string, string>
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

        const email = principal.type === "user" ? emails.get(principal.id) : undefined;
        byPrincipal.set(key, {
            principal: email ? { ...principal, email } : principal,
            role,
        });
    }

    return {
        grants: [...byPrincipal.values()].sort((a, b) =>
            (a.principal.email ?? a.principal.id).localeCompare(
                b.principal.email ?? b.principal.id
            )
        ),
        // Public links land Thursday; the field is frozen, the feature is not.
        publicLink: null,
    };
};
