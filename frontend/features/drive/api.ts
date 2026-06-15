import { fetcher } from "@/lib/fetcher";
import { API_CONFIG } from "@/lib/config";
import type {
    DriveList,
    FolderCreateInput,
    DriveFolder,
    FolderListQuery,
} from "@/features/drive/types";

/**
 * Drive API wrappers — written against the future Phase 1 endpoints.
 * NOTE: backend GET/POST for folders does not exist yet. The drive list hook
 * reads a static mock this week (see features/drive/hooks/use-drive-list.ts);
 * swap the hook's queryFn to `listDrive` once the endpoint ships.
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
): Promise<DriveFolder> =>
    fetcher<DriveFolder>(API_CONFIG.drive.CREATE_FOLDER, {
        method: "POST",
        body: input,
    });
