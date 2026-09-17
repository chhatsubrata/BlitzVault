import { useMutation, useQueryClient } from "@tanstack/react-query";

import { revokeShareGrant } from "@/features/sharing/api";
import { sharingKeys } from "@/features/sharing/keys";
import type { ShareResourceRef, SharedWith } from "@/features/sharing/types";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

// `email` is carried only so the toast can name the person; the server keys the
// revoke by principal id.
type RevokeVars = { principalId: string; email?: string };
type RevokeShareGrantContext = { previous?: SharedWith };

/** Remove one person's access to a file or folder. */
export function useRevokeShareGrant(resource: ShareResourceRef) {
    const queryClient = useQueryClient();
    const sharesKey = sharingKeys.shares(resource.kind, resource.id);

    return useMutation<SharedWith, unknown, RevokeVars, RevokeShareGrantContext>({
        mutationFn: ({ principalId }) => revokeShareGrant(resource, principalId),
        onMutate: async ({ principalId }) => {
            await queryClient.cancelQueries({ queryKey: sharesKey });
            const previous = queryClient.getQueryData<SharedWith>(sharesKey);

            queryClient.setQueryData<SharedWith>(sharesKey, (old) =>
                old
                    ? {
                          ...old,
                          grants: old.grants.filter(
                              (grant) => grant.principal.id !== principalId
                          ),
                      }
                    : old
            );

            return { previous };
        },
        onError: (error, _vars, context) => {
            if (context?.previous) {
                queryClient.setQueryData(sharesKey, context.previous);
            }
            showErrorToast(error);
        },
        onSuccess: (shared, { email }) => {
            queryClient.setQueryData<SharedWith>(sharesKey, shared);
            showSuccessToast(email ? `Removed ${email}` : "Access removed");
        },
        onSettled: () => {
            void queryClient.invalidateQueries({
                queryKey: sharingKeys.resource(resource.kind, resource.id),
            });
        },
    });
}
