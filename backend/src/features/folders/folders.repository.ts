import { In, IsNull } from "typeorm";

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
        .orderBy("folder.created_at", "ASC")
        .addOrderBy("folder.id", "ASC")
        .take(limit + 1);

    if (parentId) {
        qb.andWhere("folder.parent_id = :parentId", { parentId });
    } else {
        qb.andWhere("folder.parent_id IS NULL");
    }

    if (cursor) {
        qb.andWhere("(folder.created_at, folder.id) > (:cursorAt, :cursorId)", {
            cursorAt: cursor.createdAt,
            cursorId: cursor.id,
        });
    }

    return qb.getMany();
};

/** Owner-scoped lookup of a single non-deleted folder. */
export const findOwnedFolderById = (
    ownerId: string,
    id: string
): Promise<Folders | null> =>
    foldersRepository.findOne({
        where: { id, owner_id: ownerId, deleted_at: IsNull() },
    });

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
