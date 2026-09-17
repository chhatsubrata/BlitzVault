/**
 * Per-item permissions for list responses (Week 3 Thu Dev1).
 *
 * The grid needs to know what the caller may do with each card — hide delete on
 * a file shared read-only, disable rename, and so on. Asking OpenFGA four
 * questions per item would be 200 checks for a 50-item page, so:
 *
 *   - `can_read` is never asked: the item is IN the list, which is the answer.
 *   - Owned items short-circuit entirely — ownership implies every relation in
 *     the frozen model (`can_write: editor or owner`, etc.), so an owner-scoped
 *     page costs zero round trips.
 *   - Everything else goes into ONE `batchCheck`, which the Redis cache serves
 *     with a single MGET.
 *
 * Today every list is owner-scoped SQL, so the batched branch does not run in
 * production yet. It is written and tested now because the alternative — adding
 * permissions to the response later, once "shared with me" lands — would mean
 * changing a shipped contract instead of filling in a field the client already
 * reads.
 */
import type { AuthorizationService } from "./types";

/** What the caller may do with one item. Mirrors the model's relations. */
export type SharePermissions = {
    canRead: boolean;
    canWrite: boolean;
    canShare: boolean;
    canDelete: boolean;
};

/**
 * How the caller holds the item. `owner` is a DB fact; `editor`/`viewer` are
 * derived from the relations, because a grant can also arrive by inheritance
 * from a parent folder and there is no tuple that says "viewer, directly".
 */
export type AccessRole = "owner" | "editor" | "viewer";

export type ItemAccess = {
    accessRole: AccessRole;
    permissions: SharePermissions;
};

export const OWNER_ACCESS: ItemAccess = {
    accessRole: "owner",
    permissions: { canRead: true, canWrite: true, canShare: true, canDelete: true },
};

/** Relations worth asking about. `can_read` is implied by being in the list. */
const ASKED = ["can_write", "can_share", "can_delete"] as const;

export type AccessQuery = {
    /** Namespaced object, e.g. `file:<uuid>`. */
    object: string;
    ownedByCaller: boolean;
};

const fromChecks = (canWrite: boolean, canShare: boolean, canDelete: boolean): ItemAccess => ({
    // An editor is exactly someone who may write; anyone else in the list got
    // there through a viewer grant.
    accessRole: canWrite ? "editor" : "viewer",
    permissions: { canRead: true, canWrite, canShare, canDelete },
});

/**
 * Resolve access for a whole page. Returns a map keyed by `object`.
 *
 * Fails closed in the same shape as `authorize()`: if the authorization engine
 * errors the page still renders, with every action disabled, rather than 500ing
 * an otherwise valid list.
 */
export const resolveItemAccess = async (args: {
    authz: AuthorizationService;
    /** The caller, namespaced: `user:<uuid>`. */
    userRef: string;
    items: AccessQuery[];
}): Promise<Map<string, ItemAccess>> => {
    const { authz, userRef, items } = args;
    const access = new Map<string, ItemAccess>();

    const unowned: string[] = [];
    for (const item of items) {
        if (item.ownedByCaller) {
            access.set(item.object, OWNER_ACCESS);
        } else if (!access.has(item.object)) {
            unowned.push(item.object);
        }
    }

    if (unowned.length === 0) return access;

    const requests = unowned.flatMap((object) =>
        ASKED.map((relation) => ({ user: userRef, relation, object }))
    );

    let results: boolean[];
    try {
        results = await authz.batchCheck(requests);
    } catch {
        results = requests.map(() => false);
    }

    unowned.forEach((object, index) => {
        const base = index * ASKED.length;
        access.set(
            object,
            fromChecks(
                results[base] ?? false,
                results[base + 1] ?? false,
                results[base + 2] ?? false
            )
        );
    });

    return access;
};
