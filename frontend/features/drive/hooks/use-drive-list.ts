import { useQuery } from "@tanstack/react-query";

import { listDrive } from "@/features/drive/api";
import { driveKeys } from "@/features/drive/keys";
import type { DriveList } from "@/features/drive/types";

/**
 * Drive list query — hits GET /api/v1/folders (owner-scoped, cursor paginated).
 * The fetcher attaches the Clerk token via the registered getter, so no token
 * is threaded here. Files are empty until the upload pipeline lands (Week 2).
 */
export function useDriveList(parentId?: string) {
    return useQuery<DriveList>({
        queryKey: driveKeys.list(parentId),
        queryFn: () => listDrive({ parentId }),
    });
}
