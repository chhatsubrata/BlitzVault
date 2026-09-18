import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createShareLink } from "@/features/sharing/api";
import { sharingKeys } from "@/features/sharing/keys";
import type { ShareResourceRef, SharedWith } from "@/features/sharing/types";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

/**
 * Turn on "anyone with the link can view".
 *
 * Deliberately NOT optimistic, unlike every other mutation in this feature. The
 * optimistic pattern needs a client-constructible result, and the client cannot
 * invent a token or a URL — it would have to render a fake address that someone
 * might copy and send. A few hundred milliseconds of a pending switch is the
 * better trade; the switch itself flips immediately so the control still feels
 * live (see share-public-link-row.tsx).
 *
 * The server is idempotent: calling this when a link already exists returns the
 * existing one with a 200 instead of minting a second token.
 */
export function useCreatePublicLink(resource: ShareResourceRef) {
    const queryClient = useQueryClient();
    const sharesKey = sharingKeys.shares(resource.kind, resource.id);

    return useMutation<SharedWith, unknown, void>({
        mutationFn: () => createShareLink(resource),
        onSuccess: (shared) => {
            // Seed from the server envelope so the token and URL render in one
            // pass, with no refetch flicker.
            queryClient.setQueryData<SharedWith>(sharesKey, shared);
            // State-describing, not event-describing: a 200 here means another
            // tab already created it, and "Link created" would then be a lie.
            showSuccessToast("Public link is on");
        },
        // No rollback: nothing was written optimistically.
        onError: (error) => showErrorToast(error),
        onSettled: () => {
            void queryClient.invalidateQueries({
                queryKey: sharingKeys.resource(resource.kind, resource.id),
            });
        },
    });
}
