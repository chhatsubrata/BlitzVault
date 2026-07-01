import { useMutation, useQueryClient } from "@tanstack/react-query";

import { moveFolder } from "@/features/drive/api";
import { driveKeys } from "@/features/drive/keys";
import type { DriveFolder, DriveList } from "@/features/drive/types";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

type MoveVars = { id: string; parentId: string | null };
type MoveContext = { previous?: DriveList };

/**
 * Move (reparent) a folder. It leaves the current view once moved, so we
 * optimistically drop the row from the source list and roll back on error.
 * The whole tree is invalidated on settle so the destination list picks it up.
 */
export function useMoveFolder(parentId?: string) {
    const queryClient = useQueryClient();
    const listKey = driveKeys.list(parentId);

    return useMutation<DriveFolder, unknown, MoveVars, MoveContext>({
        mutationFn: ({ id, parentId: destId }) => moveFolder(id, destId),
        onMutate: async ({ id }) => {
            await queryClient.cancelQueries({ queryKey: listKey });
            const previous = queryClient.getQueryData<DriveList>(listKey);

            queryClient.setQueryData<DriveList>(listKey, (old) =>
                old
                    ? {
                          ...old,
                          folders: old.folders.filter(
                              (folder) => folder.id !== id
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
        onSuccess: () => showSuccessToast("Folder moved"),
        onSettled: () => {
            // Source + destination lists both change — refresh the whole tree.
            void queryClient.invalidateQueries({ queryKey: driveKeys.all });
        },
    });
}
