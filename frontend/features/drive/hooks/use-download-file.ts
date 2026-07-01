import { useMutation } from "@tanstack/react-query";

import { ApiError } from "@/lib/api-error";
import { getFileDownloadUrl } from "@/features/drive/api";
import { showErrorToast, showLoadingToast, showSuccessToast } from "@/lib/toast";

type DownloadArgs = { id: string; name: string };
type DownloadContext = { toastId: string | number };

/**
 * Download a file. Navigating to the signed Cloudinary URL just opens the asset
 * inline (no forced attachment cross-origin), so instead we fetch the bytes into
 * a blob and save from a SAME-ORIGIN object URL — which also lets the `download`
 * attribute apply the real filename (ignored on cross-origin URLs).
 */
export function useDownloadFile() {
    return useMutation<void, unknown, DownloadArgs, DownloadContext>({
        mutationFn: async ({ id, name }) => {
            const url = await getFileDownloadUrl(id);

            const response = await fetch(url);
            if (!response.ok) {
                throw new ApiError({
                    status: response.status,
                    code: "UPSTREAM",
                    message: `Download failed (${response.status}).`,
                });
            }

            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = objectUrl;
            anchor.download = name;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            // Revoke after the click has been dispatched.
            URL.revokeObjectURL(objectUrl);
        },
        // Loading toast up front (fetching the bytes can take a moment for large
        // files), then flip the same toast to success/error in place.
        onMutate: ({ name }) => ({
            toastId: showLoadingToast(`Preparing “${name}” — your download will start shortly…`),
        }),
        onSuccess: (_data, { name }, context) =>
            showSuccessToast(`“${name}” downloaded`, context?.toastId),
        onError: (error, _vars, context) => showErrorToast(error, context?.toastId),
    });
}
