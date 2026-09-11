import { fetcher } from "@/lib/fetcher";
import { API_CONFIG, SHARING_MOCK_ENABLED } from "@/lib/config";
import {
    mockCreateShareGrant,
    mockListShares,
    mockRevokeShareGrant,
} from "@/features/sharing/mock/shares-mock";
import type {
    ShareGrantCreateInput,
    ShareResourceRef,
    SharedWith,
} from "@/features/sharing/types";

/**
 * Sharing API wrappers for the Phase 2 share endpoints.
 *
 * The endpoints do not exist yet (Dev1 ships them Week 3 Wednesday) — the
 * response envelope is what is frozen. Each call falls back to a fixture while
 * SHARING_MOCK_ENABLED is on; remove those guard lines with the mock directory.
 *
 * Every call returns the whole `shared` envelope so a mutation can seed the
 * read cache directly and an optimistic rollback has a full snapshot to
 * restore. Public-link create/revoke are deliberately absent: only the
 * response shape is frozen, and the request shape changes when password and
 * expiry land.
 */

// Sub-resource paths compose off the area base, as in features/drive/api.ts.
const sharesPath = (resource: ShareResourceRef): string =>
    resource.kind === "file"
        ? `${API_CONFIG.files.LIST}/${resource.id}/shares`
        : `${API_CONFIG.drive.LIST_FOLDERS}/${resource.id}/shares`;

export const listShares = async (
    resource: ShareResourceRef
): Promise<SharedWith> => {
    if (SHARING_MOCK_ENABLED) return mockListShares(resource);

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
    if (SHARING_MOCK_ENABLED) return mockCreateShareGrant(resource, input);

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
    if (SHARING_MOCK_ENABLED) return mockRevokeShareGrant(resource, principalId);

    const { shared } = await fetcher<{ shared: SharedWith }>(
        `${sharesPath(resource)}/${principalId}`,
        { method: "DELETE" }
    );
    return shared;
};
