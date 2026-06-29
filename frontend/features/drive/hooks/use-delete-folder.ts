import { useMutation, useQueryClient } from "@tanstack/react-query";

import { deleteFolder } from "@/features/drive/api";
import { driveKeys } from "@/features/drive/keys";
import type { DriveList } from "@/features/drive/types";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

type DeleteContext = { previous?: DriveList };

/**
 * Soft-delete a folder (and its subtree, server-side) from the current view.
 * Optimistically removes the row and rolls back on error.
 */
export function useDeleteFolder(parentId?: string) {
    const queryClient = useQueryClient();
    const listKey = driveKeys.list(parentId);

    return useMutation<{ id: string; deleted: true }, unknown, string, DeleteContext>({
        mutationFn: (id: string) => deleteFolder(id),
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: listKey });
            const previous = queryClient.getQueryData<DriveList>(listKey);

            queryClient.setQueryData<DriveList>(listKey, (old) =>
                old
                    ? {
                          ...old,
                          folders: old.folders.filter((folder) => folder.id !== id),
                      }
                    : old
            );

            return { previous };
        },
        onError: (error, _id, context) => {
            if (context?.previous) {
                queryClient.setQueryData(listKey, context.previous);
            }
            showErrorToast(error);
        },
        onSuccess: () => showSuccessToast("Folder deleted"),
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: listKey });
        },
    });
}
