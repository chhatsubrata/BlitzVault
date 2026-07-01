import { useMutation, useQueryClient } from "@tanstack/react-query";

import { deleteFile } from "@/features/drive/api";
import { useRestoreFiles } from "@/features/drive/hooks/use-restore-files";
import { driveKeys } from "@/features/drive/keys";
import type { DriveList } from "@/features/drive/types";
import { showErrorToast, showUndoToast } from "@/lib/toast";

type DeleteContext = { previous?: DriveList };

/**
 * Soft-delete a file from the current view. Optimistically removes the row and
 * rolls back on error. On success, surfaces an Undo toast that restores the
 * file — the single-file restore path (bulk restore is available via
 * `useRestoreFiles` for a future trash view).
 */
export function useDeleteFile(parentId?: string) {
    const queryClient = useQueryClient();
    const listKey = driveKeys.list(parentId);
    const restore = useRestoreFiles();

    return useMutation<{ id: string; deleted: true }, unknown, string, DeleteContext>({
        mutationFn: (id: string) => deleteFile(id),
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: listKey });
            const previous = queryClient.getQueryData<DriveList>(listKey);

            queryClient.setQueryData<DriveList>(listKey, (old) =>
                old
                    ? { ...old, files: old.files.filter((file) => file.id !== id) }
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
        onSuccess: (_data, id) => {
            showUndoToast("File deleted", {
                label: "Undo",
                onClick: () => restore.mutate([id]),
            });
        },
        onSettled: () => {
            // Whole tree: the folder list loses the row, the trash gains it.
            void queryClient.invalidateQueries({ queryKey: driveKeys.all });
        },
    });
}
