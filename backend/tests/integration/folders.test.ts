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

import { app } from "../../src/app";
import AppDataSource from "../../src/config/db";
import { Users } from "../../src/entities/Users";
import { Folders } from "../../src/entities/Folders";
import { Files } from "../../src/entities/Files";
import { verifySessionToken } from "../../src/shared/services/clerk.service";

const TEST_CLERK_ID = "user_test_folders_crud";
const TEST_EMAIL = "folders.crud.test@blitzvault.test";
const TEST_USERNAME = "folders_crud_user";

const mockedVerify = vi.mocked(verifySessionToken);

let ownerId: string;

const auth = () => ({ Authorization: "Bearer faketoken" });

const createFolder = (body: { name: string; parentId?: string | null }) =>
    request(app).post("/api/v1/folders").set(auth()).send(body);

beforeAll(async () => {
    const users = AppDataSource.getRepository(Users);
    const user = await users.save(
        users.create({
            clerk_user_id: TEST_CLERK_ID,
            email: TEST_EMAIL,
            username: TEST_USERNAME,
        })
    );
    ownerId = user.id;
});

afterAll(async () => {
    await AppDataSource.getRepository(Files).delete({ owner_id: ownerId });
    await AppDataSource.getRepository(Folders).delete({ owner_id: ownerId });
    await AppDataSource.getRepository(Users).delete({ clerk_user_id: TEST_CLERK_ID });
});

beforeEach(() => {
    mockedVerify.mockResolvedValue({ sub: TEST_CLERK_ID, sid: "sess_1" } as never);
});

describe("Folder CRUD", () => {
    it("creates a root folder", async () => {
        const res = await createFolder({ name: "Root A" });

        expect(res.status).toBe(201);
        expect(res.body.data.folder.name).toBe("Root A");
        expect(res.body.data.folder.parentId).toBeNull();

        const row = await AppDataSource.getRepository(Folders).findOneBy({
            id: res.body.data.folder.id,
        });
        expect(row?.owner_id).toBe(ownerId);
    });

    it("creates a child folder under a parent", async () => {
        const parent = await createFolder({ name: "Parent" });
        const child = await createFolder({
            name: "Child",
            parentId: parent.body.data.folder.id,
        });

        expect(child.status).toBe(201);
        expect(child.body.data.folder.parentId).toBe(parent.body.data.folder.id);
    });

    it("rejects a child under a missing parent with 404", async () => {
        const res = await createFolder({
            name: "Orphan",
            parentId: "00000000-0000-0000-0000-000000000000",
        });

        expect(res.status).toBe(404);
    });

    it("renames a folder", async () => {
        const created = await createFolder({ name: "Before" });
        const id = created.body.data.folder.id;

        const res = await request(app)
            .patch(`/api/v1/folders/${id}`)
            .set(auth())
            .send({ name: "After" });

        expect(res.status).toBe(200);
        expect(res.body.data.folder.name).toBe("After");

        const row = await AppDataSource.getRepository(Folders).findOneBy({ id });
        expect(row?.name).toBe("After");
    });

    it("moves a folder under a new parent", async () => {
        const target = await createFolder({ name: "Target" });
        const mover = await createFolder({ name: "Mover" });
        const moverId = mover.body.data.folder.id;

        const res = await request(app)
            .patch(`/api/v1/folders/${moverId}/move`)
            .set(auth())
            .send({ parentId: target.body.data.folder.id });

        expect(res.status).toBe(200);
        expect(res.body.data.folder.parentId).toBe(target.body.data.folder.id);
    });

    it("rejects moving a folder into its own descendant with 409", async () => {
        // A -> B -> C, then attempt to move A under C.
        const a = await createFolder({ name: "A" });
        const aId = a.body.data.folder.id;
        const b = await createFolder({ name: "B", parentId: aId });
        const bId = b.body.data.folder.id;
        const c = await createFolder({ name: "C", parentId: bId });
        const cId = c.body.data.folder.id;

        const res = await request(app)
            .patch(`/api/v1/folders/${aId}/move`)
            .set(auth())
            .send({ parentId: cId });

        expect(res.status).toBe(409);
    });

    it("returns the breadcrumb trail root -> self for a nested folder", async () => {
        const a = await createFolder({ name: "PathA" });
        const aId = a.body.data.folder.id;
        const b = await createFolder({ name: "PathB", parentId: aId });
        const bId = b.body.data.folder.id;
        const c = await createFolder({ name: "PathC", parentId: bId });
        const cId = c.body.data.folder.id;

        const res = await request(app)
            .get(`/api/v1/folders/${cId}/path`)
            .set(auth());

        expect(res.status).toBe(200);
        expect(res.body.data.path).toEqual([
            { id: aId, name: "PathA" },
            { id: bId, name: "PathB" },
            { id: cId, name: "PathC" },
        ]);
    });

    it("returns 404 for the path of an unknown folder", async () => {
        const res = await request(app)
            .get("/api/v1/folders/00000000-0000-0000-0000-000000000000/path")
            .set(auth());

        expect(res.status).toBe(404);
    });

    it("cascade soft-deletes a folder, its subtree, and contained files", async () => {
        // Build A -> B -> C with a file under C.
        const a = await createFolder({ name: "DelA" });
        const aId = a.body.data.folder.id;
        const b = await createFolder({ name: "DelB", parentId: aId });
        const bId = b.body.data.folder.id;
        const c = await createFolder({ name: "DelC", parentId: bId });
        const cId = c.body.data.folder.id;

        const files = AppDataSource.getRepository(Files);
        const file = await files.save(
            files.create({
                owner_id: ownerId,
                folder_id: cId,
                name: "doc.txt",
                size_bytes: "10",
                mime: "text/plain",
                storage_key: `users/${ownerId}/del-file`,
                storage_provider: "cloudinary",
                checksum_sha256: null,
                status: "ready",
            })
        );

        const res = await request(app)
            .delete(`/api/v1/folders/${aId}`)
            .set(auth());

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({ id: aId, deleted: true });

        const folders = AppDataSource.getRepository(Folders);
        // withDeleted so we can read the deleted_at column.
        const rows = await folders.find({
            where: [{ id: aId }, { id: bId }, { id: cId }],
            withDeleted: true,
        });
        expect(rows).toHaveLength(3);
        for (const row of rows) {
            expect(row.deleted_at).not.toBeNull();
        }

        const fileRow = await files.findOne({
            where: { id: file.id },
            withDeleted: true,
        });
        expect(fileRow?.deleted_at).not.toBeNull();

        // The deleted root no longer shows up in the live listing.
        const list = await request(app)
            .get("/api/v1/folders")
            .set(auth());
        const listedIds = list.body.data.folders.map(
            (f: { id: string }) => f.id
        );
        expect(listedIds).not.toContain(aId);
    });
});
