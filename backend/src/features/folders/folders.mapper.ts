import { Folders } from "../../entities/Folders";
import type { AccessRole, ItemAccess, SharePermissions } from "../../shared/services/authz";

/**
 * Client-facing folder shape (camelCase; internal columns omitted).
 * `accessRole`/`permissions` are present on list responses only — see
 * files.mapper.ts for why they are optional.
 */
export type FolderResponse = {
    id: string;
    name: string;
    parentId: string | null;
    createdAt: string;
    updatedAt: string;
    accessRole?: AccessRole;
    permissions?: SharePermissions;
};

export const toFolderResponse = (
    folder: Folders,
    access?: ItemAccess
): FolderResponse => ({
    id: folder.id,
    name: folder.name,
    parentId: folder.parent_id,
    createdAt: folder.created_at.toISOString(),
    updatedAt: folder.updated_at.toISOString(),
    ...(access
        ? { accessRole: access.accessRole, permissions: access.permissions }
        : {}),
});

/** Slim ancestor entry for breadcrumb trails. */
export type FolderCrumb = {
    id: string;
    name: string;
};

export const toFolderCrumb = (folder: Folders): FolderCrumb => ({
    id: folder.id,
    name: folder.name,
});
