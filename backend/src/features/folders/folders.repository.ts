import AppDataSource from "../../config/db";
import { Folders } from "../../entities/Folders";

export const foldersRepository = AppDataSource.getRepository(Folders);

export type FolderCursor = { createdAt: string; id: string };

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
