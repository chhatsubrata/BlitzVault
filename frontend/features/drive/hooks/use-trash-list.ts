import { useQuery } from "@tanstack/react-query";

import { listTrash } from "@/features/drive/api";
import { driveKeys } from "@/features/drive/keys";
import type { TrashList } from "@/features/drive/types";

/**
 * Trash query — GET /api/v1/files/trash (owner-scoped, newest-deletion-first).
 * First page only; the endpoint is cursor-paginated for a future "load more".
 */
export function useTrashList() {
    return useQuery<TrashList>({
        queryKey: driveKeys.trash(),
        queryFn: () => listTrash(),
    });
}
