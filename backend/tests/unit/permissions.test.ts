import { describe, expect, it, vi } from "vitest";

import {
    OWNER_ACCESS,
    resolveItemAccess,
} from "../../src/shared/services/authz/permissions";
import type { AuthorizationService, CheckRequest } from "../../src/shared/services/authz";

/**
 * The cost model matters as much as the answers here: a 50-item page must not
 * turn into 200 OpenFGA calls, and an owner-scoped page must not call at all.
 */

const ALICE = "user:11111111-1111-1111-1111-111111111111";
const FILE_A = "file:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const FILE_B = "file:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

/** Answers `true` for the relations in `granted`, `false` otherwise. */
const authzGranting = (granted: string[]) => {
    const batchCheck = vi.fn(async (requests: CheckRequest[]) =>
        requests.map((request) => granted.includes(request.relation))
    );
    const authz = {
        check: vi.fn(async () => false),
        batchCheck,
        write: vi.fn(async () => undefined),
        readTuples: vi.fn(async () => []),
    } satisfies AuthorizationService;
    return { authz, batchCheck };
};

describe("resolveItemAccess", () => {
    it("asks nothing at all for a page the caller owns", async () => {
        const { authz, batchCheck } = authzGranting([]);

        const access = await resolveItemAccess({
            authz,
            userRef: ALICE,
            items: [
                { object: FILE_A, ownedByCaller: true },
                { object: FILE_B, ownedByCaller: true },
            ],
        });

        // Ownership implies every relation in the frozen model, so a round trip
        // would only confirm what the DB already said.
        expect(batchCheck).not.toHaveBeenCalled();
        expect(access.get(FILE_A)).toEqual(OWNER_ACCESS);
        expect(access.get(FILE_B)).toEqual(OWNER_ACCESS);
    });

    it("resolves a whole page of unowned items in one batch", async () => {
        const { authz, batchCheck } = authzGranting(["can_write", "can_delete"]);

        await resolveItemAccess({
            authz,
            userRef: ALICE,
            items: [
                { object: FILE_A, ownedByCaller: false },
                { object: FILE_B, ownedByCaller: false },
            ],
        });

        expect(batchCheck).toHaveBeenCalledTimes(1);
        // 3 relations x 2 items — can_read is never asked, because being in the
        // list is the answer.
        const [requests] = batchCheck.mock.calls[0];
        expect(requests).toHaveLength(6);
        expect(requests.map((r) => r.relation)).not.toContain("can_read");
        expect(new Set(requests.map((r) => r.user))).toEqual(new Set([ALICE]));
    });

    it("reads an editor from can_write", async () => {
        const { authz } = authzGranting(["can_write", "can_share", "can_delete"]);

        const access = await resolveItemAccess({
            authz,
            userRef: ALICE,
            items: [{ object: FILE_A, ownedByCaller: false }],
        });

        expect(access.get(FILE_A)).toEqual({
            accessRole: "editor",
            permissions: {
                canRead: true,
                canWrite: true,
                canShare: true,
                canDelete: true,
            },
        });
    });

    it("reads a viewer when nothing but read is granted", async () => {
        const { authz } = authzGranting([]);

        const access = await resolveItemAccess({
            authz,
            userRef: ALICE,
            items: [{ object: FILE_A, ownedByCaller: false }],
        });

        expect(access.get(FILE_A)).toEqual({
            accessRole: "viewer",
            permissions: {
                // Implied: the item would not be in the list otherwise.
                canRead: true,
                canWrite: false,
                canShare: false,
                canDelete: false,
            },
        });
    });

    it("keeps each item's answers separate", async () => {
        const batchCheck = vi.fn(async (requests: CheckRequest[]) =>
            // Only FILE_B is writable.
            requests.map((r) => r.object === FILE_B && r.relation === "can_write")
        );
        const authz = {
            check: vi.fn(async () => false),
            batchCheck,
            write: vi.fn(async () => undefined),
            readTuples: vi.fn(async () => []),
        } satisfies AuthorizationService;

        const access = await resolveItemAccess({
            authz,
            userRef: ALICE,
            items: [
                { object: FILE_A, ownedByCaller: false },
                { object: FILE_B, ownedByCaller: false },
            ],
        });

        expect(access.get(FILE_A)?.accessRole).toBe("viewer");
        expect(access.get(FILE_B)?.accessRole).toBe("editor");
    });

    it("mixes owned and unowned items, asking only about the unowned", async () => {
        const { authz, batchCheck } = authzGranting([]);

        const access = await resolveItemAccess({
            authz,
            userRef: ALICE,
            items: [
                { object: FILE_A, ownedByCaller: true },
                { object: FILE_B, ownedByCaller: false },
            ],
        });

        const [requests] = batchCheck.mock.calls[0];
        expect(requests).toHaveLength(3);
        expect(requests.every((r) => r.object === FILE_B)).toBe(true);
        expect(access.get(FILE_A)).toEqual(OWNER_ACCESS);
    });

    it("degrades to no permissions when the engine fails, rather than throwing", async () => {
        const authz = {
            check: vi.fn(async () => false),
            batchCheck: vi.fn(async () => {
                throw new Error("openfga unreachable");
            }),
            write: vi.fn(async () => undefined),
            readTuples: vi.fn(async () => []),
        } satisfies AuthorizationService;

        const access = await resolveItemAccess({
            authz,
            userRef: ALICE,
            items: [{ object: FILE_A, ownedByCaller: false }],
        });

        // The list still renders; every action is disabled. Failing the whole
        // page would be a worse answer than a read-only one.
        expect(access.get(FILE_A)).toEqual({
            accessRole: "viewer",
            permissions: {
                canRead: true,
                canWrite: false,
                canShare: false,
                canDelete: false,
            },
        });
    });

    it("handles an empty page", async () => {
        const { authz, batchCheck } = authzGranting([]);

        const access = await resolveItemAccess({ authz, userRef: ALICE, items: [] });

        expect(access.size).toBe(0);
        expect(batchCheck).not.toHaveBeenCalled();
    });
});
