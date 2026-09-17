import { In, IsNull, Not } from "typeorm";

import AppDataSource from "../../config/db";
import { Files } from "../../entities/Files";
import { Folders } from "../../entities/Folders";
import { Users } from "../../entities/Users";
import { keysetTimeExpr, KeysetCursor } from "../../shared/pagination/cursor";
import {
    enqueueTuples,
    fileRef,
    folderRef,
    ownershipTuples,
} from "../../shared/services/authz";

const usersRepository = AppDataSource.getRepository(Users);
const foldersRepository = AppDataSource.getRepository(Folders);
const filesRepository = AppDataSource.getRepository(Files);

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

/** True when `folderId` exists, is owned by `ownerId`, and is not soft-deleted. */
export const folderExistsForOwner = async (
    ownerId: string,
    folderId: string
): Promise<boolean> => {
    const count = await foldersRepository.count({
        where: { id: folderId, owner_id: ownerId, deleted_at: IsNull() },
    });
    return count > 0;
};

export type CreatePendingFileInput = {
    id: string;
    ownerId: string;
    folderId: string;
    name: string;
    sizeBytes: number;
    mime: string;
    storageKey: string;
    storageProvider: string;
    checksumSha256: Buffer | null;
};

/**
 * Insert a `pending` File row reserved by /upload/init, with its OpenFGA tuples
 * in the same transaction (docs/openfga-model.md → Tuple write strategy).
 *
 * Tuples are written at reservation, not at /upload/complete: the row exists
 * from here on, and an abandoned upload leaving an owner tuple behind is
 * harmless — while a completed upload with no tuple would 403 its own owner.
 */
export const createPendingFile = (
    input: CreatePendingFileInput
): Promise<Files> =>
    AppDataSource.transaction(async (manager) => {
        const file = await manager.save(
            manager.create(Files, {
                id: input.id,
                owner_id: input.ownerId,
                folder_id: input.folderId,
                name: input.name,
                // bigint column -> string.
                size_bytes: String(input.sizeBytes),
                mime: input.mime,
                storage_key: input.storageKey,
                storage_provider: input.storageProvider,
                checksum_sha256: input.checksumSha256,
                status: "pending",
            })
        );

        await enqueueTuples(
            manager,
            ownershipTuples({
                object: fileRef(file.id),
                ownerId: input.ownerId,
                parent: folderRef(input.folderId),
            })
        );

        return file;
    });

/**
 * Lookup by id alone, for routes that already ran `loadResource` + `authorize`.
 * Owner-scoping those would 404 a file the caller was legitimately granted —
 * access is OpenFGA's answer, not an `owner_id` comparison.
 */
export const findLiveFileById = (id: string): Promise<Files | null> =>
    filesRepository.findOne({ where: { id, deleted_at: IsNull() } });

/** Owner-scoped lookup of a single non-deleted file. */
export const findOwnedFileById = (
    ownerId: string,
    id: string
): Promise<Files | null> =>
    filesRepository.findOne({
        where: { id, owner_id: ownerId, deleted_at: IsNull() },
    });

/** Flip a verified upload to `ready`, syncing the authoritative size if known. */
export const markFileReady = (file: Files, sizeBytes?: number): Promise<Files> => {
    file.status = "ready";
    if (sizeBytes !== undefined) {
        file.size_bytes = String(sizeBytes);
    }
    return filesRepository.save(file);
};

type FindFilesPageArgs = {
    ownerId: string;
    folderId: string;
    limit: number;
    cursor?: KeysetCursor;
};

/**
 * Keyset (cursor) pagination over (created_at, id) for the live files directly
 * inside a folder, owner-scoped. Returns up to `limit + 1` rows so the caller
 * can detect whether another page exists. Mirrors `findFoldersPage`.
 */
export const findFilesPage = ({
    ownerId,
    folderId,
    limit,
    cursor,
}: FindFilesPageArgs): Promise<Files[]> => {
    const qb = filesRepository
        .createQueryBuilder("file")
        .where("file.owner_id = :ownerId", { ownerId })
        .andWhere("file.folder_id = :folderId", { folderId })
        .andWhere("file.deleted_at IS NULL")
        .orderBy(keysetTimeExpr("file.created_at"), "ASC")
        .addOrderBy("file.id", "ASC")
        .take(limit + 1);

    if (cursor) {
        qb.andWhere(
            `(${keysetTimeExpr("file.created_at")}, file.id) > (:cursorAt::timestamptz, :cursorId)`,
            { cursorAt: cursor.createdAt, cursorId: cursor.id }
        );
    }

    return qb.getMany();
};

type FindDeletedFilesPageArgs = {
    ownerId: string;
    limit: number;
    cursor?: KeysetCursor;
};

/**
 * Keyset pagination over the caller's soft-deleted files (the trash), across
 * all folders, newest-deletion-first. `withDeleted` is required so the query
 * sees rows the default manager hides; the keyset walks `(deleted_at, id)`
 * descending, so the cursor comparison is `<` (mirror of the ascending lists).
 */
export const findDeletedFilesPage = ({
    ownerId,
    limit,
    cursor,
}: FindDeletedFilesPageArgs): Promise<Files[]> => {
    const qb = filesRepository
        .createQueryBuilder("file")
        .withDeleted()
        .where("file.owner_id = :ownerId", { ownerId })
        .andWhere("file.deleted_at IS NOT NULL")
        .orderBy(keysetTimeExpr("file.deleted_at"), "DESC")
        .addOrderBy("file.id", "DESC")
        .take(limit + 1);

    if (cursor) {
        qb.andWhere(
            `(${keysetTimeExpr("file.deleted_at")}, file.id) < (:cursorAt::timestamptz, :cursorId)`,
            { cursorAt: cursor.createdAt, cursorId: cursor.id }
        );
    }

    return qb.getMany();
};

/** Soft-delete live files by id (no-op on already-deleted rows). */
export const softDeleteFiles = async (fileIds: string[]): Promise<void> => {
    if (fileIds.length === 0) return;
    await filesRepository.softDelete({ id: In(fileIds), deleted_at: IsNull() });
};

/**
 * Owner-scoped lookup of soft-deleted files by id (for restore verification).
 * `withDeleted` is required — the default query manager hides deleted rows.
 */
export const findOwnedDeletedFiles = (
    ownerId: string,
    fileIds: string[]
): Promise<Files[]> =>
    filesRepository.find({
        where: { id: In(fileIds), owner_id: ownerId, deleted_at: Not(IsNull()) },
        withDeleted: true,
    });

/** Clear `deleted_at` on the given files (callers verify ownership first). */
export const restoreFiles = async (fileIds: string[]): Promise<void> => {
    if (fileIds.length === 0) return;
    await filesRepository.restore({ id: In(fileIds) });
};
