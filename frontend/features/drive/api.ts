import { fetcher } from "@/lib/fetcher";
import { API_CONFIG } from "@/lib/config";
import type {
    DriveList,
    FolderCreateInput,
    DriveFolder,
    FolderCrumb,
    FolderListQuery,
} from "@/features/drive/types";

/**
 * Drive API wrappers for the Phase 1 folder endpoints (frozen contract).
 * The fetcher unwraps the `{ data }` envelope; folder writes return
 * `{ data: { folder } }`, so we read `.folder` here. Delete returns
 * `{ data: { id, deleted } }`; path returns `{ data: { path } }`.
 */

export const listDrive = async (
    query: Partial<FolderListQuery> = {}
): Promise<DriveList> => {
    const params = new URLSearchParams();
    if (query.parentId) params.set("parentId", query.parentId);
    if (query.cursor) params.set("cursor", query.cursor);
    if (query.limit) params.set("limit", String(query.limit));
    const qs = params.toString();

    return fetcher<DriveList>(
        `${API_CONFIG.drive.LIST_FOLDERS}${qs ? `?${qs}` : ""}`,
        {
            method: "GET",
        }
    );
};

export const createFolder = async (
    input: FolderCreateInput
): Promise<DriveFolder> => {
    const { folder } = await fetcher<{ folder: DriveFolder }>(
        API_CONFIG.drive.CREATE_FOLDER,
        { method: "POST", body: input }
    );
    return folder;
};

export const renameFolder = async (
    id: string,
    name: string
): Promise<DriveFolder> => {
    const { folder } = await fetcher<{ folder: DriveFolder }>(
        `${API_CONFIG.drive.LIST_FOLDERS}/${id}`,
        { method: "PATCH", body: { name } }
    );
    return folder;
};

export const deleteFolder = async (
    id: string
): Promise<{ id: string; deleted: true }> =>
    fetcher<{ id: string; deleted: true }>(
        `${API_CONFIG.drive.LIST_FOLDERS}/${id}`,
        { method: "DELETE" }
    );

export const getFolderPath = async (id: string): Promise<FolderCrumb[]> => {
    const { path } = await fetcher<{ path: FolderCrumb[] }>(
        `${API_CONFIG.drive.LIST_FOLDERS}/${id}/path`,
        { method: "GET" }
    );
    return path;
};
