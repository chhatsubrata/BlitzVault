import { Folders } from "../../entities/Folders";

/** Client-facing folder shape (camelCase; internal columns omitted). */
export type FolderResponse = {
    id: string;
    name: string;
    parentId: string | null;
    createdAt: string;
    updatedAt: string;
};

export const toFolderResponse = (folder: Folders): FolderResponse => ({
    id: folder.id,
    name: folder.name,
    parentId: folder.parent_id,
    createdAt: folder.created_at.toISOString(),
    updatedAt: folder.updated_at.toISOString(),
});
