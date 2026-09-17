import type { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import { ShareLinks } from "../../src/entities/ShareLinks";
import {
    ANON_USER_REF,
    findActivePublicLink,
    publicLinkTuples,
    resolvePublicLink,
} from "../../src/features/sharing/links.service";
import type { ShareResource } from "../../src/features/sharing/sharing.service";
import type { AuthorizationService } from "../../src/shared/services/authz";

/**
 * The parts of public links the integration suite cannot reach: expiry (no
 * request field sets it yet) and the tuple triple's exact shape, which is the
 * contract with the frozen FGA model and cannot be asserted from HTTP.
 */

const LINK_ID = "11111111-1111-1111-1111-111111111111";
const FILE_ID = "22222222-2222-2222-2222-222222222222";

const resource: ShareResource = {
    kind: "file",
    id: FILE_ID,
    ownerId: "33333333-3333-3333-3333-333333333333",
};

const row = (overrides: Partial<ShareLinks> = {}): ShareLinks =>
    ({
        id: LINK_ID,
        resource_type: "file",
        resource_id: FILE_ID,
        token: "t".repeat(43),
        permission: "viewer",
        password_hash: null,
        expires_at: null,
        created_by: resource.ownerId,
        revoked_at: null,
        created_at: new Date(),
        ...overrides,
    }) as ShareLinks;

/** A DataSource whose ShareLinks repository returns `found`. */
const fakeDs = (found: ShareLinks | null): DataSource =>
    ({
        getRepository: () => ({ findOne: vi.fn(async () => found) }),
    }) as unknown as DataSource;

const allowAll: AuthorizationService = {
    check: vi.fn(async () => true),
    batchCheck: vi.fn(async (requests) => requests.map(() => true)),
    write: vi.fn(async () => undefined),
    readTuples: vi.fn(async () => []),
};

const hourFromNow = () => new Date(Date.now() + 3_600_000);
const hourAgo = () => new Date(Date.now() - 3_600_000);

describe("publicLinkTuples", () => {
    it("writes the three tuples the frozen model needs", () => {
        const ops = publicLinkTuples(LINK_ID, `file:${FILE_ID}`, "write");

        expect(ops).toEqual([
            {
                op: "write",
                tuple: {
                    user: `file:${FILE_ID}`,
                    relation: "resource",
                    object: `public_link:${LINK_ID}`,
                },
            },
            {
                op: "write",
                tuple: {
                    user: `public_link:${LINK_ID}#accessor`,
                    relation: "viewer",
                    object: `file:${FILE_ID}`,
                },
            },
            {
                op: "write",
                tuple: {
                    user: "user:*",
                    relation: "accessor",
                    object: `public_link:${LINK_ID}`,
                },
            },
        ]);
    });

    it("revokes exactly what it wrote", () => {
        const written = publicLinkTuples(LINK_ID, `file:${FILE_ID}`, "write");
        const deleted = publicLinkTuples(LINK_ID, `file:${FILE_ID}`, "delete");

        // Leaving the viewer tuple behind would keep access alive for a token
        // nobody can look up any more.
        expect(deleted.map((op) => op.tuple)).toEqual(written.map((op) => op.tuple));
        expect(deleted.every((op) => op.op === "delete")).toBe(true);
    });

    it("namespaces a folder link the same way", () => {
        const [first] = publicLinkTuples(LINK_ID, `folder:${FILE_ID}`, "write");
        expect(first.tuple.user).toBe(`folder:${FILE_ID}`);
    });
});

describe("findActivePublicLink", () => {
    it("returns the link with its shareable URL", async () => {
        const link = await findActivePublicLink(resource, {
            authz: allowAll,
            ds: fakeDs(row()),
        });

        expect(link).toEqual({
            token: "t".repeat(43),
            role: "viewer",
            url: `http://localhost:3000/l/${"t".repeat(43)}`,
        });
    });

    it("treats an expired link as no link", async () => {
        const link = await findActivePublicLink(resource, {
            authz: allowAll,
            ds: fakeDs(row({ expires_at: hourAgo() })),
        });

        expect(link).toBeNull();
    });

    it("keeps a link that expires later", async () => {
        const link = await findActivePublicLink(resource, {
            authz: allowAll,
            ds: fakeDs(row({ expires_at: hourFromNow() })),
        });

        expect(link).not.toBeNull();
    });
});

describe("resolvePublicLink", () => {
    const resolve = (found: ShareLinks | null, authz: AuthorizationService = allowAll) =>
        resolvePublicLink("t".repeat(43), { authz, ds: fakeDs(found) });

    it("rejects an unknown token", async () => {
        await expect(resolve(null)).rejects.toThrow("Link not found.");
    });

    it("rejects a revoked link", async () => {
        await expect(resolve(row({ revoked_at: new Date() }))).rejects.toThrow(
            "Link not found."
        );
    });

    it("rejects an expired link", async () => {
        await expect(resolve(row({ expires_at: hourAgo() }))).rejects.toThrow(
            "Link not found."
        );
    });

    it("gives every rejection the same message", async () => {
        const messages = await Promise.all(
            [null, row({ revoked_at: new Date() }), row({ expires_at: hourAgo() })].map(
                (found) =>
                    resolve(found).catch((error: Error) => error.message)
            )
        );

        // A visitor must not be able to tell "never existed" from "revoked".
        expect(new Set(messages).size).toBe(1);
    });
});

describe("anonymous principal", () => {
    it("is a concrete subject, not the wildcard", () => {
        // OpenFGA rejects `user:*` as the subject of a Check; the stored
        // wildcard tuple is what makes this concrete id match.
        expect(ANON_USER_REF).toBe("user:anon");
        expect(ANON_USER_REF).not.toContain("*");
    });
});
