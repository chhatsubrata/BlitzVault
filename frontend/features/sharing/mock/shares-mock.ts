import type {
    ShareGrantCreateInput,
    ShareResourceRef,
    SharedWith,
} from "@/features/sharing/types";

/**
 * TEMPORARY — delete this directory when the backend share endpoints land
 * (Week 3 Wednesday), along with SHARING_MOCK_ENABLED in lib/config.ts, the
 * guard lines in features/sharing/api.ts, and the env docs.
 *
 * Contract-shaped fixtures so the share UI can be built and demoed before the
 * endpoints exist. Enabled only by NEXT_PUBLIC_SHARING_MOCK in a dev build.
 */

// Enough latency that pending/disabled states are actually visible.
const MOCK_LATENCY_MS = 250;

const delay = (): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));

// Module-level so grants added in one dialog survive until a page reload.
const store = new Map<string, SharedWith>();

const refKey = (resource: ShareResourceRef): string =>
    `${resource.kind}:${resource.id}`;

const seed = (): SharedWith => ({
    grants: [
        {
            principal: { type: "user", id: "usr_mock_1", email: "ada@example.com" },
            role: "editor",
        },
        {
            principal: { type: "user", id: "usr_mock_2", email: "grace@example.com" },
            role: "viewer",
        },
    ],
    publicLink: null,
});

const read = (resource: ShareResourceRef): SharedWith => {
    const key = refKey(resource);
    const existing = store.get(key);
    if (existing) {
        return existing;
    }

    const fresh = seed();
    store.set(key, fresh);
    return fresh;
};

export const mockListShares = async (
    resource: ShareResourceRef
): Promise<SharedWith> => {
    await delay();
    return read(resource);
};

export const mockCreateShareGrant = async (
    resource: ShareResourceRef,
    input: ShareGrantCreateInput
): Promise<SharedWith> => {
    await delay();
    const current = read(resource);

    // Re-granting an existing email changes the role, matching an upsert.
    const grants = current.grants.filter(
        (grant) => grant.principal.email !== input.email
    );

    const next: SharedWith = {
        ...current,
        grants: [
            ...grants,
            {
                principal: {
                    type: "user",
                    id: `usr_mock_${input.email}`,
                    email: input.email,
                },
                role: input.role,
            },
        ],
    };

    store.set(refKey(resource), next);
    return next;
};

export const mockRevokeShareGrant = async (
    resource: ShareResourceRef,
    principalId: string
): Promise<SharedWith> => {
    await delay();
    const current = read(resource);

    const next: SharedWith = {
        ...current,
        grants: current.grants.filter(
            (grant) => grant.principal.id !== principalId
        ),
    };

    store.set(refKey(resource), next);
    return next;
};
