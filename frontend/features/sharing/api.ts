import { fetcher } from "@/lib/fetcher";
import { API_CONFIG } from "@/lib/config";
import type {
    MemberSuggestion,
    ShareGrantCreateInput,
    ShareResourceRef,
    SharedWith,
} from "@/features/sharing/types";

/**
 * Sharing API wrappers for the Phase 2 share endpoints.
 *
 * Every share call returns the whole `shared` envelope so a mutation can seed
 * the read cache directly and an optimistic rollback has a full snapshot to
 * restore. Public-link create/revoke are deliberately absent: only the response
 * shape is frozen, and the request shape changes when password and expiry land.
 */

// Sub-resource paths compose off the area base, as in features/drive/api.ts.
const sharesPath = (resource: ShareResourceRef): string =>
    resource.kind === "file"
        ? `${API_CONFIG.files.LIST}/${resource.id}/shares`
        : `${API_CONFIG.drive.LIST_FOLDERS}/${resource.id}/shares`;

export const listShares = async (
    resource: ShareResourceRef
): Promise<SharedWith> => {
    const { shared } = await fetcher<{ shared: SharedWith }>(
        sharesPath(resource),
        { method: "GET" }
    );
    return shared;
};

export const createShareGrant = async (
    resource: ShareResourceRef,
    input: ShareGrantCreateInput
): Promise<SharedWith> => {
    const { shared } = await fetcher<{ shared: SharedWith }>(
        sharesPath(resource),
        { method: "POST", body: input }
    );
    return shared;
};

export const revokeShareGrant = async (
    resource: ShareResourceRef,
    principalId: string
): Promise<SharedWith> => {
    const { shared } = await fetcher<{ shared: SharedWith }>(
        `${sharesPath(resource)}/${principalId}`,
        { method: "DELETE" }
    );
    return shared;
};

/**
 * Member-picker typeahead. Separate from the share calls because it addresses
 * the user directory, not a resource — the backend caps `limit` at 10 and
 * rejects a term under two characters, so callers must gate on length.
 */
export const searchMembers = async (
    term: string,
    limit?: number
): Promise<MemberSuggestion[]> => {
    const query = new URLSearchParams({ q: term });
    if (limit !== undefined) query.set("limit", String(limit));

    const { users } = await fetcher<{ users: MemberSuggestion[] }>(
        `${API_CONFIG.users.SEARCH}?${query.toString()}`,
        { method: "GET" }
    );
    return users;
};
