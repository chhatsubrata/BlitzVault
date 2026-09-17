import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Mock Clerk so requireAuth never hits the network. DB writes run for real
// against test Postgres.
vi.mock("../../src/shared/services/clerk.service", async (importOriginal) => {
    const actual =
        await importOriginal<typeof import("../../src/shared/services/clerk.service")>();
    return {
        ...actual,
        verifySessionToken: vi.fn(),
    };
});

// Mock storage so download / thumbnail paths need no Cloudinary creds.
vi.mock("../../src/shared/services/storage", () => ({
    createStorageAdapter: vi.fn(() => ({
        getPresignedDownload: vi.fn(
            async (key: string, ttl: number) =>
                `https://cdn.test/signed/${key}?exp=${ttl}`
        ),
        getThumbnailUrl: vi.fn((key: string) => `https://cdn.test/thumb/${key}`),
        deleteObject: vi.fn(),
    })),
}));

import { app } from "../../src/app";
import AppDataSource from "../../src/config/db";
import { Files } from "../../src/entities/Files";
import { Folders } from "../../src/entities/Folders";
import { Users } from "../../src/entities/Users";
import { verifySessionToken } from "../../src/shared/services/clerk.service";

/**
 * Cross-user access on :id routes. Runs in CI with FGA_ENABLED=false, i.e.
 * authorize()'s transitional owner fallback — the same 403/404/200 contract the
 * live OpenFGA path must honour once CI has a store (Week 3 Fri).
 */

const ALICE = {
    clerk: "user_test_authz_alice",
    email: "authz.alice@blitzvault.test",
    username: "authz_alice",
};
const BOB = {
    clerk: "user_test_authz_bob",
    email: "authz.bob@blitzvault.test",
    username: "authz_bob",
};
const MISSING_ID = "00000000-0000-0000-0000-000000000000";

const mockedVerify = vi.mocked(verifySessionToken);
const auth = () => ({ Authorization: "Bearer faketoken" });
const actAs = (clerkId: string) =>
    mockedVerify.mockResolvedValue({ sub: clerkId, sid: "sess_1" } as never);

let aliceId: string;
let bobId: string;
let folderId: string;
let fileId: string;

/**
 * Remove this suite's fixtures wherever they are. Runs before AND after, so a
 * run that dies mid-way (or a machine whose .env.local changed the auth mode)
 * cannot leave rows behind that collide with the unique email/username on the
 * next run.
 */
const purgeFixtures = async (): Promise<void> => {
    const users = AppDataSource.getRepository(Users);
    const stale = await users.find({
        where: [{ clerk_user_id: ALICE.clerk }, { clerk_user_id: BOB.clerk }],
        select: { id: true },
    });

    for (const { id } of stale) {
        // FK order: files → folders → users.
        await AppDataSource.getRepository(Files).delete({ owner_id: id });
        await AppDataSource.getRepository(Folders).delete({ owner_id: id });
    }
    if (stale.length > 0) {
        await users.delete(stale.map(({ id }) => id));
    }
};

beforeAll(async () => {
    await purgeFixtures();

    const users = AppDataSource.getRepository(Users);
    aliceId = (await users.save(users.create({ clerk_user_id: ALICE.clerk, email: ALICE.email, username: ALICE.username }))).id;
    bobId = (await users.save(users.create({ clerk_user_id: BOB.clerk, email: BOB.email, username: BOB.username }))).id;

    const folders = AppDataSource.getRepository(Folders);
    folderId = (await folders.save(folders.create({ owner_id: aliceId, name: "Alice Root", parent_id: null }))).id;

    const files = AppDataSource.getRepository(Files);
    fileId = (
        await files.save(
            files.create({
                owner_id: aliceId,
                folder_id: folderId,
                name: "alice.txt",
                size_bytes: "10",
                mime: "text/plain",
                storage_key: `users/${aliceId}/authz-alice`,
                storage_provider: "cloudinary",
                checksum_sha256: null,
                status: "ready",
            })
        )
    ).id;
});

afterAll(purgeFixtures);

describe("authorize(): another user's folder", () => {
    it("403s reading its path", async () => {
        actAs(BOB.clerk);
        const res = await request(app).get(`/api/v1/folders/${folderId}/path`).set(auth());
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("403s renaming it, and the row is untouched", async () => {
        actAs(BOB.clerk);
        const res = await request(app)
            .patch(`/api/v1/folders/${folderId}`)
            .set(auth())
            .send({ name: "Stolen" });
        expect(res.status).toBe(403);

        const row = await AppDataSource.getRepository(Folders).findOneBy({ id: folderId });
        expect(row?.name).toBe("Alice Root");
    });

    it("403s moving it", async () => {
        actAs(BOB.clerk);
        const res = await request(app)
            .patch(`/api/v1/folders/${folderId}/move`)
            .set(auth())
            .send({ parentId: null });
        expect(res.status).toBe(403);
    });

    it("403s deleting it, and it stays live", async () => {
        actAs(BOB.clerk);
        const res = await request(app).delete(`/api/v1/folders/${folderId}`).set(auth());
        expect(res.status).toBe(403);

        const row = await AppDataSource.getRepository(Folders).findOneBy({ id: folderId });
        expect(row?.deleted_at).toBeNull();
    });
});

describe("authorize(): another user's file", () => {
    it("403s downloading it", async () => {
        actAs(BOB.clerk);
        const res = await request(app).get(`/api/v1/files/${fileId}/download`).set(auth());
        expect(res.status).toBe(403);
    });

    it("403s deleting it, and it stays live", async () => {
        actAs(BOB.clerk);
        const res = await request(app).delete(`/api/v1/files/${fileId}`).set(auth());
        expect(res.status).toBe(403);

        const row = await AppDataSource.getRepository(Files).findOneBy({ id: fileId });
        expect(row?.deleted_at).toBeNull();
    });
});

describe("authorize(): existence is not hidden", () => {
    it("404s an unknown folder before any permission check", async () => {
        actAs(BOB.clerk);
        const res = await request(app).get(`/api/v1/folders/${MISSING_ID}/path`).set(auth());
        expect(res.status).toBe(404);
    });

    it("404s an unknown file", async () => {
        actAs(BOB.clerk);
        const res = await request(app).delete(`/api/v1/files/${MISSING_ID}`).set(auth());
        expect(res.status).toBe(404);
    });
});

describe("authorize(): the owner still passes", () => {
    it("reads the folder path", async () => {
        actAs(ALICE.clerk);
        const res = await request(app).get(`/api/v1/folders/${folderId}/path`).set(auth());
        expect(res.status).toBe(200);
        expect(res.body.data.path).toEqual([{ id: folderId, name: "Alice Root" }]);
    });

    it("downloads the file", async () => {
        actAs(ALICE.clerk);
        const res = await request(app).get(`/api/v1/files/${fileId}/download`).set(auth());
        expect(res.status).toBe(200);
        expect(res.body.data.downloadUrl).toContain("signed/");
    });

    it("renames the folder", async () => {
        actAs(ALICE.clerk);
        const res = await request(app)
            .patch(`/api/v1/folders/${folderId}`)
            .set(auth())
            .send({ name: "Alice Root" });
        expect(res.status).toBe(200);
    });
});

describe("authorize(): unsynced caller", () => {
    it("401s a valid token with no local user row", async () => {
        actAs("user_test_authz_never_synced");
        const res = await request(app).get(`/api/v1/folders/${folderId}/path`).set(auth());
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe("UNAUTHENTICATED");
    });
});

// Referenced so the fixture id is not flagged unused if a future case drops it.
void bobId;
