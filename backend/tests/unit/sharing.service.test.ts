import { beforeEach, describe, expect, it, vi } from "vitest";

import { FgaOutbox } from "../../src/entities/FgaOutbox";
import { ConflictError, NotFoundError } from "../../src/shared/errors/AppError";
import {
    grantShare,
    listShares,
    revokeShare,
    type ShareResource,
    type SharingDeps,
} from "../../src/features/sharing/sharing.service";
import type { TupleKey } from "../../src/shared/services/authz/types";
import { createFakeAuthz } from "../helpers/fake-authz";

/**
 * Service rules with a stubbed DataSource: the tuples OpenFGA already holds
 * come from the fake authz store, the queued ones from an in-memory outbox.
 * The HTTP + drain path is covered by tests/integration/sharing.test.ts.
 */

const OWNER_ID = "11111111-1111-1111-1111-111111111111";
const BOB_ID = "22222222-2222-2222-2222-222222222222";
const FILE: ShareResource = {
    kind: "file",
    id: "33333333-3333-3333-3333-333333333333",
    ownerId: OWNER_ID,
};
const OBJECT = `file:${FILE.id}`;

type OutboxRow = Pick<FgaOutbox, "op" | "tuple" | "status" | "created_at">;

const makeDeps = (
    users: Array<{ id: string; email: string }>,
    pending: OutboxRow[] = [],
    /** The resource's active public link row, if it has one. */
    shareLink: { token: string; expires_at: Date | null } | null = null
) => {
    const authz = createFakeAuthz();
    const saved: OutboxRow[] = [...pending];

    const repositories: Record<string, unknown> = {
        FgaOutbox: {
            find: async () => saved.filter((row) => row.status === "pending"),
        },
        Users: {
            find: async () => users,
            findOne: async ({ where }: { where: { email?: string } }) =>
                users.find((user) => user.email === where.email) ?? null,
        },
        // listShares reads the public link from `share_links` — the wildcard
        // accessor tuple proves a link exists but carries no token.
        ShareLinks: {
            findOne: async () => shareLink,
        },
    };

    const ds = {
        getRepository: (entity: { name: string }) => repositories[entity.name],
        transaction: async (work: (manager: unknown) => Promise<unknown>) =>
            work({
                save: async (_entity: unknown, rows: Array<{ op: FgaOutbox["op"]; tuple: TupleKey }>) => {
                    for (const row of rows) {
                        saved.push({ ...row, status: "pending", created_at: new Date() });
                    }
                    return rows;
                },
            }),
    } as never;

    return { deps: { authz, ds } satisfies SharingDeps, authz, saved };
};

const pendingWrite = (relation: string, user: string): OutboxRow => ({
    op: "write",
    tuple: { user, relation, object: OBJECT },
    status: "pending",
    created_at: new Date(),
});

describe("listShares", () => {
    beforeEach(() => vi.clearAllMocks());

    it("lists stored grants with emails, never the owner tuple", async () => {
        const { deps, authz } = makeDeps([{ id: BOB_ID, email: "bob@test.dev" }]);
        await authz.write({
            writes: [
                { user: `user:${OWNER_ID}`, relation: "owner", object: OBJECT },
                { user: `user:${BOB_ID}`, relation: "viewer", object: OBJECT },
            ],
        });

        expect(await listShares(FILE, deps)).toEqual({
            grants: [
                { principal: { type: "user", id: BOB_ID, email: "bob@test.dev" }, role: "viewer" },
            ],
            publicLink: null,
        });
    });

    it("surfaces the active public link alongside the grants", async () => {
        const token = "p".repeat(43);
        const { deps } = makeDeps([], [], { token, expires_at: null });

        const shared = await listShares(FILE, deps);

        // The copy affordance in the share dialog reads this.
        expect(shared.publicLink).toEqual({
            token,
            role: "viewer",
            url: `http://localhost:3000/l/${token}`,
        });
    });

    it("hides an expired public link from the share list", async () => {
        const { deps } = makeDeps([], [], {
            token: "q".repeat(43),
            expires_at: new Date(Date.now() - 1_000),
        });

        expect((await listShares(FILE, deps)).publicLink).toBeNull();
    });

    it("overlays pending outbox rows the worker has not drained yet", async () => {
        const { deps } = makeDeps(
            [{ id: BOB_ID, email: "bob@test.dev" }],
            [pendingWrite("editor", `user:${BOB_ID}`)]
        );

        const shared = await listShares(FILE, deps);
        expect(shared.grants).toEqual([
            { principal: { type: "user", id: BOB_ID, email: "bob@test.dev" }, role: "editor" },
        ]);
    });

    it("drops a grant whose pending row revokes it", async () => {
        const { deps, authz } = makeDeps(
            [{ id: BOB_ID, email: "bob@test.dev" }],
            [
                {
                    op: "delete",
                    tuple: { user: `user:${BOB_ID}`, relation: "viewer", object: OBJECT },
                    status: "pending",
                    created_at: new Date(),
                },
            ]
        );
        await authz.write({
            writes: [{ user: `user:${BOB_ID}`, relation: "viewer", object: OBJECT }],
        });

        expect((await listShares(FILE, deps)).grants).toEqual([]);
    });
});

describe("grantShare", () => {
    it("queues the new role and deletes the opposite one", async () => {
        const { deps, saved } = makeDeps([{ id: BOB_ID, email: "bob@test.dev" }]);

        const shared = await grantShare(FILE, { email: "bob@test.dev", role: "editor" }, deps);

        expect(saved).toEqual([
            {
                op: "write",
                tuple: { user: `user:${BOB_ID}`, relation: "editor", object: OBJECT },
                status: "pending",
                created_at: expect.any(Date),
            },
            {
                op: "delete",
                tuple: { user: `user:${BOB_ID}`, relation: "viewer", object: OBJECT },
                status: "pending",
                created_at: expect.any(Date),
            },
        ]);
        expect(shared.grants[0].role).toBe("editor");
    });

    it("404s an email with no account", async () => {
        const { deps } = makeDeps([]);
        await expect(
            grantShare(FILE, { email: "ghost@test.dev", role: "viewer" }, deps)
        ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("409s granting to the owner", async () => {
        const { deps } = makeDeps([{ id: OWNER_ID, email: "owner@test.dev" }]);
        await expect(
            grantShare(FILE, { email: "owner@test.dev", role: "viewer" }, deps)
        ).rejects.toBeInstanceOf(ConflictError);
    });
});

describe("revokeShare", () => {
    it("queues a delete for both roles and reports an empty list", async () => {
        const { deps, saved } = makeDeps([{ id: BOB_ID, email: "bob@test.dev" }]);

        const shared = await revokeShare(FILE, BOB_ID, deps);

        expect(saved.map((row) => [row.op, row.tuple.relation])).toEqual([
            ["delete", "editor"],
            ["delete", "viewer"],
        ]);
        expect(shared.grants).toEqual([]);
    });
});
