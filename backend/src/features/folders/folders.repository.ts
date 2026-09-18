import { In, IsNull } from "typeorm";

import { keysetTimeExpr } from "../../shared/pagination/cursor";
import {
    enqueueTuples,
    folderRef,
    ownershipTuples,
    type TupleOp,
} from "../../shared/services/authz";
import AppDataSource from "../../config/db";
import { Files } from "../../entities/Files";
import { Folders } from "../../entities/Folders";
import { Users } from "../../entities/Users";

export const foldersRepository = AppDataSource.getRepository(Folders);
const usersRepository = AppDataSource.getRepository(Users);

export type FolderCursor = { createdAt: string; id: string };

/** Resolve the local user UUID from a Clerk subject, or null if not synced. */
export const findOwnerIdByClerkId = async (
    clerkUserId: string
): Promise<string | null> => {
    const user = await usersRepository.findOne({
        where: { clerk_user_id: clerkUserId },
        select: { id: true },
    });
    return user?.id ?? null;
};

type FindFoldersPageArgs = {
    ownerId: string;
    parentId?: string;
    limit: number;
    cursor?: FolderCursor;
};

type FindSharedFoldersPageArgs = {
    /** REQUIRED — see the note below on why this is not optional. */
    parentId: string;
    limit: number;
    cursor?: FolderCursor;
};

/**
 * Subfolders of one folder, regardless of who owns them.
 *
 * For a folder shared with the caller: the grant is on the folder, and the
 * model inherits it down through `parent`, so its children are readable even
 * though `owner_id` is someone else's. The owner-scoped query above would
 * return an empty page and show a hollow folder.
 *
 * **`parentId` is deliberately required.** This query has no ownership filter,
 * so the only thing keeping it safe is that the caller has already been checked
 * for `can_read` on that specific parent. An optional parentId would silently
 * degrade to "every folder at the drive root, for everyone" — hence a separate
 * function rather than a flag on findFoldersPage.
 */
export const findSharedFoldersPage = ({
    parentId,
    limit,
    cursor,
}: FindSharedFoldersPageArgs): Promise<Folders[]> => {
    const qb = foldersRepository
        .createQueryBuilder("folder")
        .where("folder.parent_id = :parentId", { parentId })
        .andWhere("folder.deleted_at IS NULL")
        .orderBy(keysetTimeExpr("folder.created_at"), "ASC")
        .addOrderBy("folder.id", "ASC")
        .take(limit + 1);

    if (cursor) {
        qb.andWhere(
            `(${keysetTimeExpr("folder.created_at")}, folder.id) > (:cursorAt::timestamptz, :cursorId)`,
            { cursorAt: cursor.createdAt, cursorId: cursor.id }
        );
    }

    return qb.getMany();
};

/** Files directly inside a folder, regardless of owner. See the note above. */
export const findSharedFolderFiles = (folderId: string): Promise<Files[]> =>
    filesRepository.find({
        where: { folder_id: folderId, deleted_at: IsNull() },
        order: { created_at: "ASC", id: "ASC" },
    });


/**
 * Keyset (cursor) pagination over (created_at, id) — no OFFSET. Returns up to
 * `limit + 1` rows so the caller can tell whether another page exists.
 */
export const findFoldersPage = ({
    ownerId,
    parentId,
    limit,
    cursor,
}: FindFoldersPageArgs): Promise<Folders[]> => {
    const qb = foldersRepository
        .createQueryBuilder("folder")
        .where("folder.owner_id = :ownerId", { ownerId })
        .andWhere("folder.deleted_at IS NULL")
        .orderBy(keysetTimeExpr("folder.created_at"), "ASC")
        .addOrderBy("folder.id", "ASC")
        .take(limit + 1);

    if (parentId) {
        qb.andWhere("folder.parent_id = :parentId", { parentId });
    } else {
        qb.andWhere("folder.parent_id IS NULL");
    }

    if (cursor) {
        qb.andWhere(
            `(${keysetTimeExpr("folder.created_at")}, folder.id) > (:cursorAt::timestamptz, :cursorId)`,
            { cursorAt: cursor.createdAt, cursorId: cursor.id }
        );
    }

    return qb.getMany();
};

const filesRepository = AppDataSource.getRepository(Files);

/**
 * Files directly inside a folder (owner-scoped, not soft-deleted), oldest first.
 * Files always have a folder, so the drive root (no folderId) has none.
 */
export const findFolderFiles = (
    ownerId: string,
    folderId: string
): Promise<Files[]> =>
    filesRepository.find({
        where: { owner_id: ownerId, folder_id: folderId, deleted_at: IsNull() },
        order: { created_at: "ASC", id: "ASC" },
    });

/** Owner-scoped lookup of a single non-deleted folder. */
export const findOwnedFolderById = (
    ownerId: string,
    id: string
): Promise<Folders | null> =>
    foldersRepository.findOne({
        where: { id, owner_id: ownerId, deleted_at: IsNull() },
    });

// Cycle backstop: a healthy tree can't exceed this depth; guards against a
// corrupted parent chain looping forever.
const MAX_ANCESTOR_DEPTH = 256;

/**
 * Walk `parent_id` upward from `id` to the root, owner-scoped. Returns the
 * chain ordered root -> self. Stops at the first missing/foreign link.
 */
export const collectAncestors = async (
    ownerId: string,
    id: string
): Promise<Folders[]> => {
    const chain: Folders[] = [];
    let currentId: string | null = id;

    for (let depth = 0; currentId && depth < MAX_ANCESTOR_DEPTH; depth += 1) {
        const folder: Folders | null = await findOwnedFolderById(
            ownerId,
            currentId
        );
        if (!folder) break;
        chain.push(folder);
        currentId = folder.parent_id;
    }

    return chain.reverse();
};

type CreateFolderArgs = {
    ownerId: string;
    name: string;
    parentId: string | null;
};

/**
 * Insert a folder owned by `ownerId` (parentId null = root), together with its
 * OpenFGA tuples in the same transaction. Without the tuples the creator would
 * be denied access to their own folder once FGA_ENABLED=true; writing them to
 * the outbox rather than to OpenFGA keeps the two stores from diverging when
 * one of the two writes fails (docs/openfga-model.md → Tuple write strategy).
 */
export const createFolder = ({
    ownerId,
    name,
    parentId,
}: CreateFolderArgs): Promise<Folders> =>
    AppDataSource.transaction(async (manager) => {
        const folder = await manager.save(
            manager.create(Folders, {
                owner_id: ownerId,
                name,
                parent_id: parentId,
            })
        );

        await enqueueTuples(
            manager,
            ownershipTuples({
                object: folderRef(folder.id),
                ownerId,
                parent: parentId ? folderRef(parentId) : null,
            })
        );

        return folder;
    });

/** Rename a folder by id. */
export const renameFolder = async (id: string, name: string): Promise<void> => {
    await foldersRepository.update({ id }, { name });
};

/**
 * Reparent a folder (parentId null = root), swapping its `parent` tuple in the
 * same transaction. One tuple change moves the whole subtree's inherited
 * access — descendants keep pointing at this folder, so nothing fans out.
 */
export const moveFolder = async (
    id: string,
    parentId: string | null
): Promise<void> => {
    await AppDataSource.transaction(async (manager) => {
        const current = await manager.findOne(Folders, {
            where: { id },
            select: { id: true, parent_id: true },
        });
        if (!current) return;

        await manager.update(Folders, { id }, { parent_id: parentId });

        const object = folderRef(id);
        const ops: TupleOp[] = [];
        if (current.parent_id) {
            ops.push({
                op: "delete",
                tuple: { user: folderRef(current.parent_id), relation: "parent", object },
            });
        }
        if (parentId) {
            ops.push({
                op: "write",
                tuple: { user: folderRef(parentId), relation: "parent", object },
            });
        }

        await enqueueTuples(manager, ops);
    });
};

/**
 * Return `rootId` plus every live descendant folder id, owner-scoped. Walks the
 * tree level by level over `parent_id` (no recursion in SQL). Powers both the
 * move-cycle check and cascade soft-delete.
 */
export const collectSubtreeIds = async (
    ownerId: string,
    rootId: string
): Promise<string[]> => {
    const all = [rootId];
    let frontier = [rootId];

    while (frontier.length > 0) {
        const children = await foldersRepository.find({
            where: {
                owner_id: ownerId,
                parent_id: In(frontier),
                deleted_at: IsNull(),
            },
            select: { id: true },
        });
        frontier = children.map((c) => c.id);
        all.push(...frontier);
    }

    return all;
};

/**
 * Soft-delete a set of folders and every live file they contain, atomically.
 * Caller passes the full subtree id set (see `collectSubtreeIds`).
 */
export const softDeleteSubtree = async (folderIds: string[]): Promise<void> => {
    if (folderIds.length === 0) return;

    await AppDataSource.transaction(async (manager) => {
        await manager.softDelete(Folders, { id: In(folderIds) });
        await manager.softDelete(Files, {
            folder_id: In(folderIds),
            deleted_at: IsNull(),
        });
    });
};
