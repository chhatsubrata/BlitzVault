import { useQuery } from "@tanstack/react-query";

import { getFolderPath } from "@/features/drive/api";
import { driveKeys } from "@/features/drive/keys";
import type { FolderCrumb } from "@/features/drive/types";

/**
 * Breadcrumb trail (root -> self) for a folder. Disabled at the drive root
 * (no folderId), where the breadcrumb is just "My Drive".
 */
export function useFolderPath(folderId?: string) {
    return useQuery<FolderCrumb[]>({
        queryKey: driveKeys.path(folderId ?? "root"),
        queryFn: () => getFolderPath(folderId as string),
        enabled: Boolean(folderId),
    });
}
