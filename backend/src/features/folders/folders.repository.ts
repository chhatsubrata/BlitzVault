import { In, IsNull } from "typeorm";

import { keysetTimeExpr } from "../../shared/pagination/cursor";
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

/** Insert a folder owned by `ownerId` (parentId null = root). */
export const createFolder = ({
    ownerId,
    name,
    parentId,
}: CreateFolderArgs): Promise<Folders> => {
    const folder = foldersRepository.create({
        owner_id: ownerId,
        name,
        parent_id: parentId,
    });
    return foldersRepository.save(folder);
};

/** Rename a folder by id. */
export const renameFolder = async (id: string, name: string): Promise<void> => {
    await foldersRepository.update({ id }, { name });
};

/** Reparent a folder (parentId null = root). */
export const moveFolder = async (
    id: string,
    parentId: string | null
): Promise<void> => {
    await foldersRepository.update({ id }, { parent_id: parentId });
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
