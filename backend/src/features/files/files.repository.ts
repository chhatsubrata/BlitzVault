import { IsNull } from "typeorm";

import AppDataSource from "../../config/db";
import { Files } from "../../entities/Files";
import { Folders } from "../../entities/Folders";
import { Users } from "../../entities/Users";

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

/** Insert a `pending` File row reserved by /upload/init. */
export const createPendingFile = (input: CreatePendingFileInput): Promise<Files> => {
    const file = filesRepository.create({
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
    });
    return filesRepository.save(file);
};

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
