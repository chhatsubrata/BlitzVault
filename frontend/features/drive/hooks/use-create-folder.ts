import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createFolder } from "@/features/drive/api";
import { driveKeys } from "@/features/drive/keys";
import type { DriveFolder, DriveList } from "@/features/drive/types";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

type CreateContext = { previous?: DriveList };

/**
 * Create a folder in the current view (parentId). Optimistically appends a temp
 * row, rolls back on error, and reconciles with the server on settle.
 */
export function useCreateFolder(parentId?: string) {
    const queryClient = useQueryClient();
    const listKey = driveKeys.list(parentId);

    return useMutation<DriveFolder, unknown, string, CreateContext>({
        mutationFn: (name: string) =>
            createFolder({ name, parentId: parentId ?? null }),
        onMutate: async (name) => {
            await queryClient.cancelQueries({ queryKey: listKey });
            const previous = queryClient.getQueryData<DriveList>(listKey);

            const now = new Date().toISOString();
            const optimistic: DriveFolder = {
                id: `temp-${crypto.randomUUID()}`,
                name,
                parentId: parentId ?? null,
                createdAt: now,
                updatedAt: now,
            };

            queryClient.setQueryData<DriveList>(listKey, (old) =>
                old
                    ? { ...old, folders: [...old.folders, optimistic] }
                    : { folders: [optimistic], files: [], nextCursor: null }
            );

            return { previous };
        },
        onError: (error, _name, context) => {
            if (context?.previous) {
                queryClient.setQueryData(listKey, context.previous);
            }
            showErrorToast(error);
        },
        onSuccess: () => showSuccessToast("Folder created"),
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: listKey });
        },
    });
}
