import { ConflictError, NotFoundError } from "../../shared/errors/AppError";
import {
    FolderCreateInput,
    FolderListQuery,
    FolderMoveInput,
    FolderRenameInput,
} from "./folders.schema";
import {
    collectAncestors,
    collectSubtreeIds,
    createFolder,
    findFolderFiles,
    findFoldersPage,
    findOwnedFolderById,
    findOwnerIdByClerkId,
    moveFolder,
    renameFolder,
    softDeleteSubtree,
} from "./folders.repository";
import {
    FolderCrumb,
    FolderResponse,
    toFolderCrumb,
    toFolderResponse,
} from "./folders.mapper";
import { FileResponse, toFileResponse } from "../files/files.mapper";
import { decodeCursor, encodeCursor } from "../../shared/pagination/cursor";

/**
 * Resolve the local user id for a Clerk subject. Mutations require a synced
 * user; an unsynced subject is a NotFound rather than a silent no-op.
 */
const resolveOwnerId = async (clerkUserId: string): Promise<string> => {
    const ownerId = await findOwnerIdByClerkId(clerkUserId);
    if (!ownerId) {
        throw new NotFoundError("User not found.");
    }
    return ownerId;
};

export type DriveListResult = {
    folders: FolderResponse[];
    files: FileResponse[];
    nextCursor: string | null;
};

/**
 * Lists the authenticated user's folders under a parent (root if absent).
 * Owner-scoped via the local user resolved from the Clerk subject.
 */
export const listDriveService = async (
    clerkUserId: string,
    query: FolderListQuery
): Promise<DriveListResult> => {
    const ownerId = await findOwnerIdByClerkId(clerkUserId);

    // User not synced yet -> empty drive rather than an error.
    if (!ownerId) {
        return { folders: [], files: [], nextCursor: null };
    }

    const rows = await findFoldersPage({
        ownerId,
        parentId: query.parentId,
        limit: query.limit,
        cursor: decodeCursor(query.cursor),
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];

    // Files live inside a folder, so only a folder view (parentId) has any.
    const files = query.parentId
        ? await findFolderFiles(ownerId, query.parentId)
        : [];

    return {
        folders: page.map(toFolderResponse),
        files: files.map(toFileResponse),
        nextCursor:
            hasMore && last
                ? encodeCursor({ createdAt: last.created_at.toISOString(), id: last.id })
                : null,
    };
};

/**
 * Create a folder owned by the caller. A given `parentId` must reference a live
 * folder the caller owns; absent/null = root.
 */
export const createFolderService = async (
    clerkUserId: string,
    input: FolderCreateInput
): Promise<FolderResponse> => {
    const ownerId = await resolveOwnerId(clerkUserId);
    const parentId = input.parentId ?? null;

    if (parentId) {
        const parent = await findOwnedFolderById(ownerId, parentId);
        if (!parent) {
            throw new NotFoundError("Parent folder not found.");
        }
    }

    const folder = await createFolder({ ownerId, name: input.name, parentId });
    return toFolderResponse(folder);
};

/** Rename a folder the caller owns. */
export const renameFolderService = async (
    clerkUserId: string,
    id: string,
    input: FolderRenameInput
): Promise<FolderResponse> => {
    const ownerId = await resolveOwnerId(clerkUserId);

    const folder = await findOwnedFolderById(ownerId, id);
    if (!folder) {
        throw new NotFoundError("Folder not found.");
    }

    await renameFolder(id, input.name);

    const updated = await findOwnedFolderById(ownerId, id);
    // Reload should always succeed right after a rename; fall back defensively.
    return toFolderResponse(updated ?? { ...folder, name: input.name });
};

/**
 * Move a folder under a new parent (null = root). Rejects cycles: a folder may
 * not be reparented under itself or any of its descendants.
 */
export const moveFolderService = async (
    clerkUserId: string,
    id: string,
    input: FolderMoveInput
): Promise<FolderResponse> => {
    const ownerId = await resolveOwnerId(clerkUserId);

    const folder = await findOwnedFolderById(ownerId, id);
    if (!folder) {
        throw new NotFoundError("Folder not found.");
    }

    const parentId = input.parentId;

    if (parentId) {
        const parent = await findOwnedFolderById(ownerId, parentId);
        if (!parent) {
            throw new NotFoundError("Parent folder not found.");
        }

        const subtree = await collectSubtreeIds(ownerId, id);
        if (subtree.includes(parentId)) {
            throw new ConflictError(
                "Cannot move a folder into itself or one of its descendants."
            );
        }
    }

    await moveFolder(id, parentId);

    const updated = await findOwnedFolderById(ownerId, id);
    return toFolderResponse(updated ?? { ...folder, parent_id: parentId });
};

export type DeleteFolderResult = { id: string; deleted: true };

/**
 * Soft-delete a folder the caller owns, cascading to its entire live subtree
 * (descendant folders + the files within them) so nothing is orphaned.
 */
export const deleteFolderService = async (
    clerkUserId: string,
    id: string
): Promise<DeleteFolderResult> => {
    const ownerId = await resolveOwnerId(clerkUserId);

    const folder = await findOwnedFolderById(ownerId, id);
    if (!folder) {
        throw new NotFoundError("Folder not found.");
    }

    const ids = await collectSubtreeIds(ownerId, id);
    await softDeleteSubtree(ids);

    return { id, deleted: true };
};

/**
 * Resolve a folder's breadcrumb trail (root -> self), owner-scoped. Powers the
 * drive breadcrumb so it survives a refresh on a deep route.
 */
export const folderPathService = async (
    clerkUserId: string,
    id: string
): Promise<FolderCrumb[]> => {
    const ownerId = await resolveOwnerId(clerkUserId);

    const folder = await findOwnedFolderById(ownerId, id);
    if (!folder) {
        throw new NotFoundError("Folder not found.");
    }

    const ancestors = await collectAncestors(ownerId, id);
    return ancestors.map(toFolderCrumb);
};
