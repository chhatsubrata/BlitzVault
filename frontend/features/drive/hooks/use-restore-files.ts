import { useMutation, useQueryClient } from "@tanstack/react-query";

import { restoreFiles } from "@/features/drive/api";
import { driveKeys } from "@/features/drive/keys";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

/**
 * Restore soft-deleted files (single id or bulk). Invalidates the whole drive
 * tree (`driveKeys.all`) so both the folder listing and the trash refetch — a
 * restored file leaves the trash and reappears in its folder.
 */
export function useRestoreFiles() {
    const queryClient = useQueryClient();

    return useMutation<{ count: number; restored: true }, unknown, string[]>({
        mutationFn: (ids: string[]) => restoreFiles(ids),
        onSuccess: ({ count }) =>
            showSuccessToast(count === 1 ? "File restored" : `${count} files restored`),
        onError: (error) => showErrorToast(error),
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: driveKeys.all });
        },
    });
}
