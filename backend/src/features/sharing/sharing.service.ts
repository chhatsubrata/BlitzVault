/**
 * Sharing rules for files and folders (Week 3 Wed).
 *
 * Grants live ONLY in OpenFGA — there is no shares table (docs/sprint-week-3.md:
 * "permissions live only in OpenFGA"). So the read model is `readTuples`, and
 * writes go to `fga_outbox` inside a transaction, never straight to OpenFGA.
 *
 * `kind` is a parameter rather than two copies of the feature: files and
 * folders have the same relations, so the only difference is the tuple prefix.
 */
import type { DataSource, EntityManager } from "typeorm";
import { In } from "typeorm";

import AppDataSource from "../../config/db";
import { FgaOutbox } from "../../entities/FgaOutbox";
import { Users } from "../../entities/Users";
import { ConflictError, NotFoundError } from "../../shared/errors/AppError";
import {
    enqueueTuples,
    fileRef,
    folderRef,
    getAuthorizationService,
    userRef,
    type AuthorizationService,
    type TupleKey,
    type TupleOp,
} from "../../shared/services/authz";
import { enqueueOutboxDrain } from "../../workers/fga/outbox.worker";
import { findActivePublicLink } from "./links.service";
import {
    toSharedWith,
    type PrincipalProfile,
    type SharedWith,
} from "./sharing.mapper";
import { SHARE_ROLES, type ShareGrantCreateInput, type ShareRole } from "./sharing.schema";

export type ShareResourceKind = "file" | "folder";

/** The resource being shared, as `loadResource` already resolved it. */
export type ShareResource = {
    kind: ShareResourceKind;
    id: string;
    ownerId: string;
};

export type SharingDeps = {
    authz: AuthorizationService;
    ds: DataSource;
};

const defaultDeps = (): SharingDeps => ({
    authz: getAuthorizationService(),
    ds: AppDataSource,
});

const objectRef = (resource: ShareResource): string =>
    resource.kind === "file" ? fileRef(resource.id) : folderRef(resource.id);

const tupleId = (tuple: TupleKey): string => `${tuple.user}|${tuple.relation}`;

const otherRole = (role: ShareRole): ShareRole =>
    role === "editor" ? "viewer" : "editor";

/**
 * Tuples that OpenFGA has, adjusted by the outbox rows still waiting to reach
 * it. Without this overlay a grant would be invisible until the worker drains
 * (sub-second, but long enough for the POST response and a quick refresh to
 * contradict each other).
 */
const effectiveTuples = async (
    { authz, ds }: SharingDeps,
    object: string
): Promise<TupleKey[]> => {
    const stored = await authz.readTuples({ object });
    const byId = new Map(stored.map((tuple) => [tupleId(tuple), tuple]));

    const pending = await ds.getRepository(FgaOutbox).find({
        where: { status: "pending" },
        order: { created_at: "ASC" },
    });

    for (const row of pending) {
        if (row.tuple.object !== object) continue;
        if (row.op === "write") {
            byId.set(tupleId(row.tuple), row.tuple);
        } else {
            byId.delete(tupleId(row.tuple));
        }
    }

    return [...byId.values()];
};

/** Email + avatar for user principals, in one query. */
const hydrateProfiles = async (
    ds: DataSource,
    tuples: TupleKey[]
): Promise<Map<string, PrincipalProfile>> => {
    const ids = [
        ...new Set(
            tuples
                .filter((tuple) => tuple.user.startsWith("user:"))
                .map((tuple) => tuple.user.slice("user:".length))
                .filter((id) => id !== "*")
        ),
    ];
    if (ids.length === 0) return new Map();

    const users = await ds.getRepository(Users).find({
        where: { id: In(ids) },
        select: { id: true, email: true, avatar_url: true },
    });
    return new Map(
        users.map((user) => [
            user.id,
            { email: user.email, avatarUrl: user.avatar_url },
        ])
    );
};

/** Who a resource is shared with. Owner is implicit and never listed. */
export const listShares = async (
    resource: ShareResource,
    deps: SharingDeps = defaultDeps()
): Promise<SharedWith> => {
    const tuples = await effectiveTuples(deps, objectRef(resource));
    const grantTuples = tuples.filter((tuple) =>
        (SHARE_ROLES as readonly string[]).includes(tuple.relation)
    );

    // The public link is read from `share_links`, not from the tuples: the
    // wildcard accessor tuple proves a link exists but carries no token, and
    // the dialog's copy button needs the URL.
    const [profiles, publicLink] = await Promise.all([
        hydrateProfiles(deps.ds, grantTuples),
        findActivePublicLink(resource, deps),
    ]);

    return toSharedWith(grantTuples, profiles, publicLink);
};

const queueOps = async (ds: DataSource, ops: TupleOp[]): Promise<void> => {
    await ds.transaction((manager: EntityManager) => enqueueTuples(manager, ops));
    // Wake the drain now rather than waiting out the poll interval: sharing is
    // the one place a user watches for the effect. Non-blocking, and the
    // repeatable job remains the safety net.
    enqueueOutboxDrain();
};

/**
 * Grant `role` to the user with `email`. A role change is a swap: the opposite
 * role is deleted in the same batch, so a principal never holds both.
 */
export const grantShare = async (
    resource: ShareResource,
    input: ShareGrantCreateInput,
    deps: SharingDeps = defaultDeps()
): Promise<SharedWith> => {
    const target = await deps.ds.getRepository(Users).findOne({
        where: { email: input.email },
        select: { id: true },
    });
    if (!target) {
        throw new NotFoundError("No BlitzVault account uses that email.");
    }
    if (target.id === resource.ownerId) {
        throw new ConflictError("The owner already has full access.");
    }

    const object = objectRef(resource);
    await queueOps(deps.ds, [
        {
            op: "write",
            tuple: { user: userRef(target.id), relation: input.role, object },
        },
        {
            op: "delete",
            tuple: { user: userRef(target.id), relation: otherRole(input.role), object },
        },
    ]);

    return listShares(resource, deps);
};

/**
 * Revoke a principal's access. Both roles are deleted because the caller knows
 * the principal, not which role it holds; a missing tuple is a benign no-op in
 * the adapter, which also makes repeat revokes safe.
 */
export const revokeShare = async (
    resource: ShareResource,
    principalId: string,
    deps: SharingDeps = defaultDeps()
): Promise<SharedWith> => {
    const object = objectRef(resource);
    await queueOps(
        deps.ds,
        SHARE_ROLES.map((role) => ({
            op: "delete" as const,
            tuple: { user: userRef(principalId), relation: role, object },
        }))
    );

    return listShares(resource, deps);
};
