import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createShareGrant } from "@/features/sharing/api";
import { sharingKeys } from "@/features/sharing/keys";
import type {
    ShareGrant,
    ShareGrantCreateInput,
    ShareResourceRef,
    SharedWith,
} from "@/features/sharing/types";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

/**
 * Marks a grant the server has not acknowledged yet. The server mints
 * principal.id; the client only knows the email, so the optimistic row carries
 * a placeholder. The colon cannot collide with a real id (usr_… / a uuid).
 */
const OPTIMISTIC_PRINCIPAL_PREFIX = "optimistic:";

export const isOptimisticGrant = (grant: ShareGrant): boolean =>
    grant.principal.id.startsWith(OPTIMISTIC_PRINCIPAL_PREFIX);

type CreateShareGrantContext = { previous?: SharedWith };

/**
 * Grant a person editor/viewer access to one file or folder.
 *
 * Granting an email that already has a grant is an UPSERT (it changes the
 * role), so the optimistic writer replaces by email rather than appending —
 * otherwise the same person shows twice until the response lands.
 */
export function useCreateShareGrant(resource: ShareResourceRef) {
    const queryClient = useQueryClient();
    const sharesKey = sharingKeys.shares(resource.kind, resource.id);

    return useMutation<
        SharedWith,
        unknown,
        ShareGrantCreateInput,
        CreateShareGrantContext
    >({
        mutationFn: (input) => createShareGrant(resource, input),
        onMutate: async (input) => {
            await queryClient.cancelQueries({ queryKey: sharesKey });
            const previous = queryClient.getQueryData<SharedWith>(sharesKey);

            const optimistic: ShareGrant = {
                principal: {
                    type: "user",
                    id: `${OPTIMISTIC_PRINCIPAL_PREFIX}${input.email}`,
                    email: input.email,
                },
                role: input.role,
            };

            queryClient.setQueryData<SharedWith>(sharesKey, (old) =>
                old
                    ? {
                          ...old,
                          // Zod already trimmed + lowercased the input email.
                          grants: [
                              ...old.grants.filter(
                                  (grant) => grant.principal.email !== input.email
                              ),
                              optimistic,
                          ],
                      }
                    : old
            );

            return { previous };
        },
        onError: (error, _input, context) => {
            if (context?.previous) {
                queryClient.setQueryData(sharesKey, context.previous);
            }
            showErrorToast(error);
        },
        onSuccess: (shared, input) => {
            // Every share call returns the whole envelope, so seeding the cache
            // swaps the placeholder id for the real one in a single render.
            queryClient.setQueryData<SharedWith>(sharesKey, shared);
            showSuccessToast(`Shared with ${input.email}`);
        },
        onSettled: () => {
            void queryClient.invalidateQueries({
                queryKey: sharingKeys.resource(resource.kind, resource.id),
            });
        },
    });
}
