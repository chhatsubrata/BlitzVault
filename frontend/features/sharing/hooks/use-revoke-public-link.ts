import { useMutation, useQueryClient } from "@tanstack/react-query";

import { revokeShareLink } from "@/features/sharing/api";
import { sharingKeys } from "@/features/sharing/keys";
import type { ShareResourceRef, SharedWith } from "@/features/sharing/types";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

type RevokePublicLinkContext = { previous?: SharedWith };

/**
 * Turn the public link off.
 *
 * Optimistic, unlike the create: the target state (`publicLink: null`) needs no
 * server-generated value, so the switch and the URL row can go immediately and
 * roll back on failure.
 *
 * Turning it back on mints a NEW token — the old URL never comes back. The
 * confirm dialog in share-public-link-row.tsx exists for that reason.
 */
export function useRevokePublicLink(resource: ShareResourceRef) {
    const queryClient = useQueryClient();
    const sharesKey = sharingKeys.shares(resource.kind, resource.id);

    return useMutation<SharedWith, unknown, void, RevokePublicLinkContext>({
        mutationFn: () => revokeShareLink(resource),
        onMutate: async () => {
            await queryClient.cancelQueries({ queryKey: sharesKey });
            const previous = queryClient.getQueryData<SharedWith>(sharesKey);

            queryClient.setQueryData<SharedWith>(sharesKey, (old) =>
                old ? { ...old, publicLink: null } : old
            );

            return { previous };
        },
        onError: (error, _vars, context) => {
            if (context?.previous) {
                queryClient.setQueryData(sharesKey, context.previous);
            }
            showErrorToast(error);
        },
        onSuccess: (shared) => {
            queryClient.setQueryData<SharedWith>(sharesKey, shared);
            showSuccessToast("Public link turned off");
        },
        onSettled: () => {
            void queryClient.invalidateQueries({
                queryKey: sharingKeys.resource(resource.kind, resource.id),
            });
        },
    });
}
