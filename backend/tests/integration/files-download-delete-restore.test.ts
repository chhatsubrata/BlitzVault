import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

// Mock storage: download returns a signed URL; thumbnail URL keeps the mapper
// credential-free. The DB lifecycle (soft-delete / restore) runs for real.
vi.mock("../../src/shared/services/storage", () => ({
    createStorageAdapter: vi.fn(() => ({
        getPresignedDownload: vi.fn(
            async (key: string, ttl: number) =>
                `https://cdn.test/signed/${key}?exp=${ttl}`
        ),
        getThumbnailUrl: vi.fn((key: string) => `https://cdn.test/w_320,h_320,c_fill/${key}`),
        deleteObject: vi.fn(),
    })),
}));

import { app } from "../../src/app";
import AppDataSource from "../../src/config/db";
import { Users } from "../../src/entities/Users";
import { Folders } from "../../src/entities/Folders";
import { Files, FileStatus } from "../../src/entities/Files";
import { verifySessionToken } from "../../src/shared/services/clerk.service";

const TEST_CLERK_ID = "user_test_files_ddr";
const TEST_EMAIL = "files.ddr.test@blitzvault.test";
const TEST_USERNAME = "files_ddr_user";
const MISSING_ID = "00000000-0000-0000-0000-000000000000";

const mockedVerify = vi.mocked(verifySessionToken);

let ownerId: string;
let folderId: string;

const auth = () => ({ Authorization: "Bearer faketoken" });

const seedFile = (
    name: string,
    status: FileStatus = "ready",
    overrides: Partial<Files> = {}
) => {
    const files = AppDataSource.getRepository(Files);
    return files.save(
        files.create({
            owner_id: ownerId,
            folder_id: folderId,
            name,
            size_bytes: "100",
            mime: "image/png",
            storage_key: `users/${ownerId}/${name}`,
            storage_provider: "cloudinary",
            checksum_sha256: null,
            status,
            ...overrides,
        })
    );
};

beforeAll(async () => {
    const users = AppDataSource.getRepository(Users);
    const folders = AppDataSource.getRepository(Folders);

    const user = await users.save(
        users.create({
            clerk_user_id: TEST_CLERK_ID,
            email: TEST_EMAIL,
            username: TEST_USERNAME,
        })
    );
    ownerId = user.id;

    const folder = await folders.save(
        folders.create({ owner_id: ownerId, name: "DDR Root", parent_id: null })
    );
    folderId = folder.id;
});

afterAll(async () => {
    await AppDataSource.getRepository(Files).delete({ owner_id: ownerId });
    await AppDataSource.getRepository(Folders).delete({ owner_id: ownerId });
    await AppDataSource.getRepository(Users).delete({ clerk_user_id: TEST_CLERK_ID });
});

beforeEach(() => {
    mockedVerify.mockResolvedValue({ sub: TEST_CLERK_ID, sid: "sess_1" } as never);
});

describe("GET /files/:id/download", () => {
    it("returns a presigned download URL for a ready file", async () => {
        const file = await seedFile("download-ready.png");

        const res = await request(app)
            .get(`/api/v1/files/${file.id}/download`)
            .set(auth());

        expect(res.status).toBe(200);
        expect(res.body.data.downloadUrl).toContain(`signed/${file.storage_key}`);
        // Default TTL applied when not supplied.
        expect(res.body.data.downloadUrl).toContain("exp=3600");
    });

    it("honors a custom expiresInSeconds", async () => {
        const file = await seedFile("download-ttl.png");

        const res = await request(app)
            .get(`/api/v1/files/${file.id}/download?expiresInSeconds=120`)
            .set(auth());

        expect(res.status).toBe(200);
        expect(res.body.data.downloadUrl).toContain("exp=120");
    });

    it("404s for an unknown file", async () => {
        const res = await request(app)
            .get(`/api/v1/files/${MISSING_ID}/download`)
            .set(auth());

        expect(res.status).toBe(404);
    });

    it("409s when the file is not ready", async () => {
        const file = await seedFile("download-pending.png", "pending");

        const res = await request(app)
            .get(`/api/v1/files/${file.id}/download`)
            .set(auth());

        expect(res.status).toBe(409);
    });
});

describe("DELETE /files/:id + POST /files/restore", () => {
    it("soft-deletes a file and hides it from the folder listing", async () => {
        const file = await seedFile("to-delete.png");

        const res = await request(app)
            .delete(`/api/v1/files/${file.id}`)
            .set(auth());

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({ id: file.id, deleted: true });

        const row = await AppDataSource.getRepository(Files).findOne({
            where: { id: file.id },
            withDeleted: true,
        });
        expect(row?.deleted_at).not.toBeNull();

        const list = await request(app)
            .get(`/api/v1/files?folderId=${folderId}`)
            .set(auth());
        const listedIds = list.body.data.files.map((f: { id: string }) => f.id);
        expect(listedIds).not.toContain(file.id);
    });

    it("404s deleting an unknown file", async () => {
        const res = await request(app)
            .delete(`/api/v1/files/${MISSING_ID}`)
            .set(auth());

        expect(res.status).toBe(404);
    });

    it("restores a single soft-deleted file", async () => {
        const file = await seedFile("restore-one.png");
        await request(app).delete(`/api/v1/files/${file.id}`).set(auth());

        const res = await request(app)
            .post("/api/v1/files/restore")
            .set(auth())
            .send({ ids: [file.id] });

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({ count: 1, restored: true });

        const row = await AppDataSource.getRepository(Files).findOneBy({ id: file.id });
        expect(row?.deleted_at).toBeNull();
    });

    it("restores multiple soft-deleted files in bulk", async () => {
        const a = await seedFile("restore-a.png");
        const b = await seedFile("restore-b.png");
        await request(app).delete(`/api/v1/files/${a.id}`).set(auth());
        await request(app).delete(`/api/v1/files/${b.id}`).set(auth());

        const res = await request(app)
            .post("/api/v1/files/restore")
            .set(auth())
            .send({ ids: [a.id, b.id] });

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({ count: 2, restored: true });

        const rows = await AppDataSource.getRepository(Files).find({
            where: [{ id: a.id }, { id: b.id }],
        });
        expect(rows).toHaveLength(2);
    });

    it("404s and restores nothing when any id is not a deleted owned file", async () => {
        const live = await seedFile("restore-live.png"); // not deleted
        const deleted = await seedFile("restore-mixed.png");
        await request(app).delete(`/api/v1/files/${deleted.id}`).set(auth());

        const res = await request(app)
            .post("/api/v1/files/restore")
            .set(auth())
            .send({ ids: [deleted.id, live.id] });

        expect(res.status).toBe(404);

        // The genuinely-deleted file stays deleted — restore is all-or-nothing.
        const row = await AppDataSource.getRepository(Files).findOne({
            where: { id: deleted.id },
            withDeleted: true,
        });
        expect(row?.deleted_at).not.toBeNull();
    });
});

describe("GET /files/trash", () => {
    it("lists soft-deleted files newest-first and excludes live ones", async () => {
        const folders = AppDataSource.getRepository(Folders);
        const bin = await folders.save(
            folders.create({ owner_id: ownerId, name: "TrashSrc", parent_id: null })
        );

        const files = AppDataSource.getRepository(Files);
        const mk = (name: string) =>
            files.save(
                files.create({
                    owner_id: ownerId,
                    folder_id: bin.id,
                    name,
                    size_bytes: "10",
                    mime: "image/png",
                    storage_key: `users/${ownerId}/trash-${name}`,
                    storage_provider: "cloudinary",
                    checksum_sha256: null,
                    status: "ready",
                })
            );
        const live = await mk("t-live.png");
        const d1 = await mk("t-del-1.png");
        const d2 = await mk("t-del-2.png");

        // Delete d1 then d2 so d2 is the most recent deletion.
        await request(app).delete(`/api/v1/files/${d1.id}`).set(auth());
        await request(app).delete(`/api/v1/files/${d2.id}`).set(auth());

        const res = await request(app).get("/api/v1/files/trash").set(auth());
        expect(res.status).toBe(200);

        const ids = res.body.data.files.map((f: { id: string }) => f.id);
        expect(ids).toContain(d1.id);
        expect(ids).toContain(d2.id);
        expect(ids).not.toContain(live.id);
        // Newest deletion first.
        expect(ids.indexOf(d2.id)).toBeLessThan(ids.indexOf(d1.id));
    });

    it("drops a file from trash once it is restored", async () => {
        const folders = AppDataSource.getRepository(Folders);
        const bin = await folders.save(
            folders.create({ owner_id: ownerId, name: "TrashRestore", parent_id: null })
        );
        const file = await seedFile("t-restore.png", "ready", { folder_id: bin.id });
        await request(app).delete(`/api/v1/files/${file.id}`).set(auth());

        const before = await request(app).get("/api/v1/files/trash").set(auth());
        expect(before.body.data.files.map((f: { id: string }) => f.id)).toContain(file.id);

        await request(app)
            .post("/api/v1/files/restore")
            .set(auth())
            .send({ ids: [file.id] });

        const after = await request(app).get("/api/v1/files/trash").set(auth());
        expect(after.body.data.files.map((f: { id: string }) => f.id)).not.toContain(
            file.id
        );
    });
});

describe("GET /files?folderId=…", () => {
    it("404s for an unknown folder", async () => {
        const res = await request(app)
            .get(`/api/v1/files?folderId=${MISSING_ID}`)
            .set(auth());

        expect(res.status).toBe(404);
    });

    it("paginates with an opaque cursor and excludes deleted files", async () => {
        // Fresh folder to isolate the page from other tests' rows.
        const folders = AppDataSource.getRepository(Folders);
        const page = await folders.save(
            folders.create({ owner_id: ownerId, name: "Paged", parent_id: null })
        );

        const files = AppDataSource.getRepository(Files);
        for (let i = 0; i < 3; i += 1) {
            await files.save(
                files.create({
                    owner_id: ownerId,
                    folder_id: page.id,
                    name: `p${i}.png`,
                    size_bytes: "10",
                    mime: "image/png",
                    storage_key: `users/${ownerId}/p${i}`,
                    storage_provider: "cloudinary",
                    checksum_sha256: null,
                    status: "ready",
                })
            );
        }

        const first = await request(app)
            .get(`/api/v1/files?folderId=${page.id}&limit=2`)
            .set(auth());
        expect(first.status).toBe(200);
        expect(first.body.data.files).toHaveLength(2);
        expect(first.body.data.nextCursor).toBeTruthy();

        const second = await request(app)
            .get(
                `/api/v1/files?folderId=${page.id}&limit=2&cursor=${encodeURIComponent(
                    first.body.data.nextCursor
                )}`
            )
            .set(auth());
        expect(second.status).toBe(200);
        expect(second.body.data.files).toHaveLength(1);
        expect(second.body.data.nextCursor).toBeNull();

        // Soft-delete one and confirm it drops out of the listing.
        const firstId = first.body.data.files[0].id;
        await request(app).delete(`/api/v1/files/${firstId}`).set(auth());
        const afterDelete = await request(app)
            .get(`/api/v1/files?folderId=${page.id}&limit=50`)
            .set(auth());
        const ids = afterDelete.body.data.files.map((f: { id: string }) => f.id);
        expect(ids).not.toContain(firstId);
    });
});
