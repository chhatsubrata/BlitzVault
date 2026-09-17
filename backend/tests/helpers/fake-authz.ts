import type {
    AuthorizationService,
    CheckRequest,
    ReadRequest,
    TupleKey,
    WriteRequest,
} from "../../src/shared/services/authz/types";

/**
 * In-memory AuthorizationService implementing the frozen model's semantics
 * (backend/src/authz/model.fga): direct grants plus `editor`/`viewer`
 * inheritance through `parent`.
 *
 * Integration tests run with FGA_ENABLED=false, where `authorize()` falls back
 * to an owner check and can never observe a share. This fake gives a suite the
 * live code path — outbox → tuples → check — without a container.
 *
 * Not a substitute for the real store: no usersets, teams or public links. Those
 * are covered by `pnpm fga:smoke` against a running OpenFGA.
 */

// A corrupt parent chain must not hang the suite.
const MAX_DEPTH = 32;

const keyOf = (tuple: TupleKey): string =>
    `${tuple.user}|${tuple.relation}|${tuple.object}`;

export type FakeAuthz = AuthorizationService & {
    /** Every tuple currently stored, for direct assertions. */
    tuples: () => TupleKey[];
    reset: () => void;
};

export const createFakeAuthz = (): FakeAuthz => {
    const store = new Map<string, TupleKey>();

    const direct = (user: string, relation: string, object: string): boolean =>
        store.has(keyOf({ user, relation, object }));

    const parentsOf = (object: string): string[] =>
        [...store.values()]
            .filter((tuple) => tuple.relation === "parent" && tuple.object === object)
            .map((tuple) => tuple.user);

    /** `editor`/`viewer` = direct grant, or the same role on a parent. */
    const hasRole = (
        user: string,
        role: "editor" | "viewer",
        object: string,
        depth = 0
    ): boolean => {
        if (depth > MAX_DEPTH) return false;
        if (direct(user, role, object)) return true;
        // viewer is implied by editor (define viewer: ... or editor).
        if (role === "viewer" && direct(user, "editor", object)) return true;

        return parentsOf(object).some((parent) => hasRole(user, role, parent, depth + 1));
    };

    const allowed = ({ user, relation, object }: CheckRequest): boolean => {
        if (direct(user, "owner", object)) return true;

        switch (relation) {
            case "can_read":
                return hasRole(user, "viewer", object) || hasRole(user, "editor", object);
            case "can_write":
            case "can_share":
            case "can_delete":
                return hasRole(user, "editor", object);
            case "owner":
            case "editor":
            case "viewer":
                return direct(user, relation, object);
            default:
                return false;
        }
    };

    return {
        async check(request) {
            return allowed(request);
        },
        async batchCheck(requests) {
            return requests.map(allowed);
        },
        async write(request: WriteRequest) {
            for (const tuple of request.writes ?? []) {
                store.set(keyOf(tuple), tuple);
            }
            for (const tuple of request.deletes ?? []) {
                store.delete(keyOf(tuple));
            }
        },
        async readTuples(request: ReadRequest) {
            return [...store.values()].filter(
                (tuple) =>
                    tuple.object === request.object &&
                    (request.relation === undefined || tuple.relation === request.relation) &&
                    (request.user === undefined || tuple.user === request.user)
            );
        },
        tuples: () => [...store.values()],
        reset: () => store.clear(),
    };
};
