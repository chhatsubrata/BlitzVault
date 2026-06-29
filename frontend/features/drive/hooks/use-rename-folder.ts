import { useMutation, useQueryClient } from "@tanstack/react-query";

import { renameFolder } from "@/features/drive/api";
import { driveKeys } from "@/features/drive/keys";
import type { DriveFolder, DriveList } from "@/features/drive/types";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

type RenameVars = { id: string; name: string };
type RenameContext = { previous?: DriveList };

/**
 * Rename a folder in the current view (parentId). Optimistically swaps the name
 * and rolls back on error.
 */
export function useRenameFolder(parentId?: string) {
    const queryClient = useQueryClient();
    const listKey = driveKeys.list(parentId);

    return useMutation<DriveFolder, unknown, RenameVars, RenameContext>({
        mutationFn: ({ id, name }) => renameFolder(id, name),
        onMutate: async ({ id, name }) => {
            await queryClient.cancelQueries({ queryKey: listKey });
            const previous = queryClient.getQueryData<DriveList>(listKey);

            queryClient.setQueryData<DriveList>(listKey, (old) =>
                old
                    ? {
                          ...old,
                          folders: old.folders.map((folder) =>
                              folder.id === id ? { ...folder, name } : folder
                          ),
                      }
                    : old
            );

            return { previous };
        },
        onError: (error, _vars, context) => {
            if (context?.previous) {
                queryClient.setQueryData(listKey, context.previous);
            }
            showErrorToast(error);
        },
        onSuccess: () => showSuccessToast("Folder renamed"),
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: listKey });
        },
    });
}
