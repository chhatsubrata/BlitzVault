import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock Clerk so requireAuth never hits the network. The DB writes (user, folder,
// file rows) run for real against test Postgres.
vi.mock("../../src/shared/services/clerk.service", async (importOriginal) => {
    const actual =
        await importOriginal<typeof import("../../src/shared/services/clerk.service")>();
    return {
        ...actual,
        verifySessionToken: vi.fn(),
    };
});

// Mock the storage factory so no Cloudinary credentials/network are needed. The
// service still drives the real init->pending->complete->ready DB lifecycle.
vi.mock("../../src/shared/services/storage", () => ({
    createStorageAdapter: vi.fn(() => ({
        createPresignedUpload: vi.fn(async (opts: { key: string }) => ({
            url: "https://api.cloudinary.com/v1_1/demo/auto/upload",
            method: "POST",
            headers: {},
            fields: { api_key: "key", signature: "sig", timestamp: "1", public_id: opts.key },
            key: opts.key,
            expiresAt: 9_999_999_999_000,
        })),
        completeUpload: vi.fn(async (key: string) => ({
            key,
            sizeBytes: 4096,
            contentType: "image/png",
            etag: "etag-abc",
        })),
        getPresignedDownload: vi.fn(),
        deleteObject: vi.fn(),
    })),
}));

import { app } from "../../src/app";
import AppDataSource from "../../src/config/db";
import { Users } from "../../src/entities/Users";
import { Folders } from "../../src/entities/Folders";
import { Files } from "../../src/entities/Files";
import { verifySessionToken } from "../../src/shared/services/clerk.service";

const TEST_CLERK_ID = "user_test_files_upload";
const TEST_EMAIL = "files.upload.test@blitzvault.test";
const TEST_USERNAME = "files_upload_user";

const mockedVerify = vi.mocked(verifySessionToken);

let ownerId: string;
let folderId: string;

const auth = () => ({ Authorization: "Bearer faketoken" });

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
        folders.create({ name: "Uploads", parent_id: null, owner_id: ownerId })
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

describe("POST /api/v1/files/upload", () => {
    it("init reserves a pending file and returns a presigned target", async () => {
        const res = await request(app)
            .post("/api/v1/files/upload/init")
            .set(auth())
            .set("Idempotency-Key", "key-init-1")
            .send({ folderId, name: "photo.png", sizeBytes: 1024, mime: "image/png" });

        expect(res.status).toBe(201);
        expect(res.body.data.fileId).toMatch(/[0-9a-f-]{36}/);
        expect(res.body.data.upload.url).toContain("cloudinary");

        const row = await AppDataSource.getRepository(Files).findOneBy({
            id: res.body.data.fileId,
        });
        expect(row?.status).toBe("pending");
        expect(row?.owner_id).toBe(ownerId);
    });

    it("init is idempotent: same Idempotency-Key returns the same fileId", async () => {
        const body = { folderId, name: "dup.png", sizeBytes: 2048, mime: "image/png" };

        const first = await request(app)
            .post("/api/v1/files/upload/init")
            .set(auth())
            .set("Idempotency-Key", "key-dup")
            .send(body);

        const second = await request(app)
            .post("/api/v1/files/upload/init")
            .set(auth())
            .set("Idempotency-Key", "key-dup")
            .send(body);

        expect(first.status).toBe(201);
        expect(second.status).toBe(201);
        expect(second.body.data.fileId).toBe(first.body.data.fileId);
    });

    it("init requires the Idempotency-Key header", async () => {
        const res = await request(app)
            .post("/api/v1/files/upload/init")
            .set(auth())
            .send({ folderId, name: "x.png", sizeBytes: 1, mime: "image/png" });

        expect(res.status).toBe(400);
    });

    it("complete verifies storage and flips the file to ready", async () => {
        const init = await request(app)
            .post("/api/v1/files/upload/init")
            .set(auth())
            .set("Idempotency-Key", "key-complete")
            .send({ folderId, name: "done.png", sizeBytes: 1024, mime: "image/png" });

        const { fileId } = init.body.data;

        const res = await request(app)
            .post("/api/v1/files/upload/complete")
            .set(auth())
            .send({ fileId });

        expect(res.status).toBe(200);
        expect(res.body.data.file.status).toBe("ready");

        const row = await AppDataSource.getRepository(Files).findOneBy({ id: fileId });
        expect(row?.status).toBe("ready");
        expect(row?.size_bytes).toBe("4096");
    });
});
