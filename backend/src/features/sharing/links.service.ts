/**
 * Public links — "anyone with the link can view" (Week 3 Thu).
 *
 * Two halves that must not drift:
 *   - the `share_links` row, which resolves a token to a resource and records
 *     expiry/revocation;
 *   - three OpenFGA tuples, which are what actually grants the access.
 *
 * The row alone grants nothing and the tuples alone cannot be found by token,
 * so both are written in ONE transaction via the outbox, exactly like a
 * user-to-user grant (see sharing.service.ts).
 */
import { randomBytes } from "crypto";
import type { DataSource, EntityManager } from "typeorm";
import { IsNull } from "typeorm";

import AppDataSource from "../../config/db";
import { Files } from "../../entities/Files";
import { Folders } from "../../entities/Folders";
import { ShareLinks } from "../../entities/ShareLinks";
import { env } from "../../shared/config/env";
import { NotFoundError } from "../../shared/errors/AppError";
import {
    enqueueTuples,
    fileRef,
    folderRef,
    getAuthorizationService,
    type AuthorizationService,
    type TupleOp,
} from "../../shared/services/authz";
import { createStorageAdapter } from "../../shared/services/storage";
import { enqueueOutboxDrain } from "../../workers/fga/outbox.worker";
import { toFileResponse, type FileResponse } from "../files/files.mapper";
import { toFolderResponse, type FolderResponse } from "../folders/folders.mapper";
import type { SharePublicLink } from "./sharing.mapper";
import type { ShareResource, ShareResourceKind } from "./sharing.service";

/**
 * The subject a public (unauthenticated) visitor is checked as.
 *
 * OpenFGA rejects `user:*` as the subject of a Check — the wildcard is only
 * meaningful on the object side of a tuple. A concrete synthetic id matches the
 * stored `(user:*, accessor, public_link:<id>)` tuple exactly as any real user
 * would, so the whole chain (accessor -> viewer -> can_read) is exercised for
 * real. It also means every anonymous visitor shares one permission-cache key.
 */
export const ANON_USER_REF = "user:anon";

/** Presigned download TTL for a public view. Short: the page can re-resolve. */
const PUBLIC_DOWNLOAD_TTL_SECONDS = 300;

/** 32 bytes -> 43 base64url chars. Matches docs/openfga-model.md. */
const TOKEN_BYTES = 32;

export type PublicLinkDeps = {
    authz: AuthorizationService;
    ds: DataSource;
};

const defaultDeps = (): PublicLinkDeps => ({
    authz: getAuthorizationService(),
    ds: AppDataSource,
});

const objectRef = (kind: ShareResourceKind, id: string): string =>
    kind === "file" ? fileRef(id) : folderRef(id);

const linkRef = (linkId: string): string => `public_link:${linkId}`;

const generateToken = (): string => randomBytes(TOKEN_BYTES).toString("base64url");

const toPublicLink = (row: ShareLinks): SharePublicLink => ({
    token: row.token,
    role: "viewer",
    // The API never serves this page; it is the address the user copies.
    url: `${env.PUBLIC_APP_URL}/l/${row.token}`,
});

/**
 * The three tuples a working link needs (docs/openfga-model.md):
 *   1. the link points at the resource (`resource`),
 *   2. the link's accessors are viewers of the resource (the grant itself),
 *   3. everyone is an accessor of this link (the wildcard).
 *
 * Revoking deletes the same three: leaving (2) behind would keep access alive
 * for a token nobody can look up any more — access with no way to audit it.
 */
export const publicLinkTuples = (
    linkId: string,
    object: string,
    op: TupleOp["op"]
): TupleOp[] => [
    { op, tuple: { user: object, relation: "resource", object: linkRef(linkId) } },
    { op, tuple: { user: `${linkRef(linkId)}#accessor`, relation: "viewer", object } },
    { op, tuple: { user: "user:*", relation: "accessor", object: linkRef(linkId) } },
];

const activeLinkWhere = (resource: ShareResource) => ({
    resource_type: resource.kind,
    resource_id: resource.id,
    revoked_at: IsNull(),
});

/** Live (unrevoked, unexpired) link for a resource, or null. */
export const findActivePublicLink = async (
    resource: ShareResource,
    deps: PublicLinkDeps = defaultDeps()
): Promise<SharePublicLink | null> => {
    const row = await deps.ds
        .getRepository(ShareLinks)
        .findOne({ where: activeLinkWhere(resource) });

    if (!row) return null;
    // An expired row stays in place (it still owns the unique index slot until
    // someone revokes or replaces it) but is not a link any more.
    if (row.expires_at && row.expires_at.getTime() <= Date.now()) return null;

    return toPublicLink(row);
};

export type CreatePublicLinkResult = {
    link: SharePublicLink;
    /** False when an active link already existed and was returned as-is. */
    created: boolean;
};

/**
 * Mint a public link, or return the existing one.
 *
 * Idempotent on purpose: the alternative is that a second click silently
 * invalidates the URL the user already pasted somewhere. Replacing a link is a
 * revoke followed by a create, which is explicit in the UI.
 */
export const createPublicLink = async (
    resource: ShareResource,
    createdBy: string,
    deps: PublicLinkDeps = defaultDeps()
): Promise<CreatePublicLinkResult> => {
    const existing = await deps.ds
        .getRepository(ShareLinks)
        .findOne({ where: activeLinkWhere(resource) });

    if (existing && !(existing.expires_at && existing.expires_at.getTime() <= Date.now())) {
        return { link: toPublicLink(existing), created: false };
    }

    const object = objectRef(resource.kind, resource.id);

    const row = await deps.ds.transaction(async (manager: EntityManager) => {
        // An expired row still holds the partial unique index slot; retire it
        // so the new link can take it.
        if (existing) {
            await manager.update(ShareLinks, { id: existing.id }, { revoked_at: new Date() });
            await enqueueTuples(manager, publicLinkTuples(existing.id, object, "delete"));
        }

        const created = await manager.save(
            manager.create(ShareLinks, {
                resource_type: resource.kind,
                resource_id: resource.id,
                token: generateToken(),
                permission: "viewer" as const,
                created_by: createdBy,
            })
        );

        // Same transaction as the row: a link that resolves but grants nothing
        // (or a grant with no link) is worse than no link at all.
        await enqueueTuples(manager, publicLinkTuples(created.id, object, "write"));
        return created;
    });

    enqueueOutboxDrain();
    return { link: toPublicLink(row), created: true };
};

/**
 * Revoke the active link. A no-op when there is none — a double-click on
 * "revoke" must not 404 at the person who already got what they wanted.
 */
export const revokePublicLink = async (
    resource: ShareResource,
    deps: PublicLinkDeps = defaultDeps()
): Promise<void> => {
    const row = await deps.ds
        .getRepository(ShareLinks)
        .findOne({ where: activeLinkWhere(resource) });
    if (!row) return;

    const object = objectRef(resource.kind, resource.id);

    await deps.ds.transaction(async (manager: EntityManager) => {
        await manager.update(ShareLinks, { id: row.id }, { revoked_at: new Date() });
        await enqueueTuples(manager, publicLinkTuples(row.id, object, "delete"));
    });

    enqueueOutboxDrain();
};

export type ResolvedPublicLink = {
    role: "viewer";
    kind: ShareResourceKind;
    file?: FileResponse;
    folder?: FolderResponse;
    /** Presigned, short-lived. Files only. */
    downloadUrl?: string;
};

// Every rejection looks identical from outside: a revoked, expired, unknown or
// deleted-resource token must not be distinguishable, or the endpoint becomes
// an oracle for which tokens once existed.
const linkNotFound = () => new NotFoundError("Link not found.");

/**
 * Resolve a token to the resource behind it, for an unauthenticated caller.
 *
 * Checked twice on purpose. The row answers "is this link still valid?", which
 * OpenFGA cannot know; the anon `check` answers "does the grant actually exist
 * in the authorization store?", which the row cannot know — the tuple may still
 * be in the outbox, or may have been revoked out from under a stale row. Access
 * is granted only if both agree.
 */
export const resolvePublicLink = async (
    token: string,
    deps: PublicLinkDeps = defaultDeps()
): Promise<ResolvedPublicLink> => {
    const row = await deps.ds.getRepository(ShareLinks).findOne({ where: { token } });

    if (!row) throw linkNotFound();
    if (row.revoked_at) throw linkNotFound();
    if (row.expires_at && row.expires_at.getTime() <= Date.now()) throw linkNotFound();

    const object = objectRef(row.resource_type, row.resource_id);

    if (env.FGA_ENABLED) {
        // Same transitional shape as authorize(): with no OpenFGA there is no
        // store to ask, and the row is the only evidence there is.
        let allowed = false;
        try {
            allowed = await deps.authz.check({
                user: ANON_USER_REF,
                relation: "can_read",
                object,
            });
        } catch {
            // Deny-by-default, and never leak an engine outage as a 5xx here.
            allowed = false;
        }
        if (!allowed) throw linkNotFound();
    }

    if (row.resource_type === "folder") {
        const folder = await deps.ds
            .getRepository(Folders)
            .findOne({ where: { id: row.resource_id, deleted_at: IsNull() } });
        if (!folder) throw linkNotFound();

        // Metadata only. Listing a public folder's children is its own
        // endpoint — it needs cursor pagination and per-item filtering.
        return { role: "viewer", kind: "folder", folder: toFolderResponse(folder) };
    }

    const file = await deps.ds
        .getRepository(Files)
        .findOne({ where: { id: row.resource_id, deleted_at: IsNull() } });
    if (!file) throw linkNotFound();
    // A pending/infected/failed upload has no verified object in storage.
    if (file.status !== "ready") throw linkNotFound();

    const downloadUrl = await createStorageAdapter().getPresignedDownload(
        file.storage_key,
        PUBLIC_DOWNLOAD_TTL_SECONDS,
        file.mime
    );

    return {
        role: "viewer",
        kind: "file",
        file: toFileResponse(file),
        downloadUrl,
    };
};
