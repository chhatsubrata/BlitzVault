import { useQuery } from "@tanstack/react-query";

import { getFolderPath } from "@/features/drive/api";
import { driveKeys } from "@/features/drive/keys";
import type { FolderCrumb } from "@/features/drive/types";
import { isApiError } from "@/lib/api-error";

/**
 * Breadcrumb trail (root -> self) for a folder. Disabled at the drive root
 * (no folderId), where the breadcrumb is just "My Drive". Also the ownership
 * signal for a deep-linked folder: a 404/403 here means the folder isn't the
 * caller's — so don't retry client errors (only transient 5xx).
 */
export function useFolderPath(folderId?: string) {
    return useQuery<FolderCrumb[]>({
        queryKey: driveKeys.path(folderId ?? "root"),
        queryFn: () => getFolderPath(folderId as string),
        enabled: Boolean(folderId),
        retry: (failureCount, error) =>
            isApiError(error) && error.status < 500 ? false : failureCount < 2,
    });
}
