import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createFakeAuthz } from "../helpers/fake-authz";

/**
 * The Week 3 Wednesday acceptance: Alice shares a file with Bob, Bob can read
 * it, Alice revokes, Bob is denied — through the real route chain, the real
 * outbox and the real drain.
 *
 * The suite runs FGA_ENABLED=false globally, which makes authorize() fall back
 * to an owner check and hides sharing entirely. So this file turns the flag on
 * and swaps the OpenFGA client for an in-memory store implementing the frozen
 * model (tests/helpers/fake-authz.ts). Everything between the HTTP request and
 * that store is production code.
 */

// The mock factories are hoisted above the imports, so they cannot close over
// the fake directly. They read it from this holder, which the module body fills
// in before any request runs.
const holder = vi.hoisted(
    (): { authz: import("../helpers/fake-authz").FakeAuthz | null } => ({ authz: null })
);

vi.mock("../../src/shared/config/env", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../src/shared/config/env")>();
    return { ...actual, env: { ...actual.env, FGA_ENABLED: true } };
});

// Only the service factory is faked; enqueueTuples, drainOutbox and the rest of
// the barrel stay real.
vi.mock("../../src/shared/services/authz", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../src/shared/services/authz")>();
    return {
        ...actual,
        getAuthorizationService: () => holder.authz!,
        createAuthorizationService: () => holder.authz!,
    };
});

vi.mock("../../src/shared/services/clerk.service", async (importOriginal) => {
    const actual =
        await importOriginal<typeof import("../../src/shared/services/clerk.service")>();
    return { ...actual, verifySessionToken: vi.fn() };
});

vi.mock("../../src/shared/services/storage", () => ({
    createStorageAdapter: vi.fn(() => ({
        getPresignedDownload: vi.fn(
            async (key: string, ttl: number) => `https://cdn.test/signed/${key}?exp=${ttl}`
        ),
        getThumbnailUrl: vi.fn((key: string) => `https://cdn.test/thumb/${key}`),
        deleteObject: vi.fn(),
    })),
}));

import { app } from "../../src/app";
import AppDataSource from "../../src/config/db";
import { Files } from "../../src/entities/Files";
import { FgaOutbox } from "../../src/entities/FgaOutbox";
import { Folders } from "../../src/entities/Folders";
import { Users } from "../../src/entities/Users";
import { createPendingFile } from "../../src/features/files/files.repository";
import { drainOutbox } from "../../src/shared/services/authz/outbox";
import { verifySessionToken } from "../../src/shared/services/clerk.service";

const fakeAuthz = createFakeAuthz();
holder.authz = fakeAuthz;

const ALICE = {
    clerk: "user_test_share_alice",
    email: "share.alice@blitzvault.test",
    username: "share_alice",
};
const BOB = {
    clerk: "user_test_share_bob",
    email: "share.bob@blitzvault.test",
    username: "share_bob",
};

const mockedVerify = vi.mocked(verifySessionToken);
const auth = () => ({ Authorization: "Bearer faketoken" });
const actAs = (clerkId: string) =>
    mockedVerify.mockResolvedValue({ sub: clerkId, sid: "sess_1" } as never);

/** One tick of the outbox worker. */
const drain = () => drainOutbox({ authz: fakeAuthz, ds: AppDataSource });

let aliceId: string;
let bobId: string;
let folderId: string;
let fileId: string;

const purgeFixtures = async (): Promise<void> => {
    const users = AppDataSource.getRepository(Users);
    const stale = await users.find({
        where: [{ clerk_user_id: ALICE.clerk }, { clerk_user_id: BOB.clerk }],
        select: { id: true },
    });

    for (const { id } of stale) {
        const files = await AppDataSource.getRepository(Files).find({
            where: { owner_id: id },
            select: { id: true },
        });
        const folders = await AppDataSource.getRepository(Folders).find({
            where: { owner_id: id },
            select: { id: true },
        });
        // Outbox rows reference resources by tuple, not FK — clear them by hand
        // so a re-run does not replay last run's tuples.
        for (const { id: fileIdToClear } of files) {
            await AppDataSource.query("DELETE FROM fga_outbox WHERE tuple->>'object' = $1", [
                `file:${fileIdToClear}`,
            ]);
        }
        for (const { id: folderIdToClear } of folders) {
            await AppDataSource.query("DELETE FROM fga_outbox WHERE tuple->>'object' = $1", [
                `folder:${folderIdToClear}`,
            ]);
        }
        await AppDataSource.getRepository(Files).delete({ owner_id: id });
        await AppDataSource.getRepository(Folders).delete({ owner_id: id });
    }
    if (stale.length > 0) {
        await users.delete(stale.map(({ id }) => id));
    }
};

beforeAll(async () => {
    await purgeFixtures();
    fakeAuthz.reset();

    const users = AppDataSource.getRepository(Users);
    aliceId = (
        await users.save(
            users.create({ clerk_user_id: ALICE.clerk, email: ALICE.email, username: ALICE.username })
        )
    ).id;
    bobId = (
        await users.save(
            users.create({ clerk_user_id: BOB.clerk, email: BOB.email, username: BOB.username })
        )
    ).id;

    // Alice creates a folder through the API so the lifecycle tuple writer runs.
    actAs(ALICE.clerk);
    const created = await request(app)
        .post("/api/v1/folders")
        .set(auth())
        .send({ name: "Shared Root" });
    folderId = created.body.data.folder.id;

    // The file goes through the repository (upload/init needs signed storage).
    fileId = (
        await createPendingFile({
            id: crypto.randomUUID(),
            ownerId: aliceId,
            folderId,
            name: "report.txt",
            sizeBytes: 10,
            mime: "text/plain",
            storageKey: `users/${aliceId}/share-report`,
            storageProvider: "cloudinary",
            checksumSha256: null,
        })
    ).id;
    await AppDataSource.getRepository(Files).update({ id: fileId }, { status: "ready" });
});

afterAll(purgeFixtures);

describe("tuple writers", () => {
    it("queues owner tuples when a resource is created", async () => {
        const pending = await AppDataSource.getRepository(FgaOutbox).find({
            where: { status: "pending" },
        });
        const objects = pending.map((row) => row.tuple.object);
        expect(objects).toContain(`folder:${folderId}`);
        expect(objects).toContain(`file:${fileId}`);
    });

    it("grants the owner access once drained, and nobody else", async () => {
        const result = await drain();
        expect(result.failed).toBe(0);

        actAs(ALICE.clerk);
        const owner = await request(app).get(`/api/v1/files/${fileId}/download`).set(auth());
        expect(owner.status).toBe(200);

        actAs(BOB.clerk);
        const stranger = await request(app).get(`/api/v1/files/${fileId}/download`).set(auth());
        expect(stranger.status).toBe(403);
    });
});

describe("share grant lifecycle", () => {
    it("lists no grants before sharing", async () => {
        actAs(ALICE.clerk);
        const res = await request(app).get(`/api/v1/files/${fileId}/shares`).set(auth());
        expect(res.status).toBe(200);
        expect(res.body.data.shared).toEqual({ grants: [], publicLink: null });
    });

    it("returns the new grant immediately, before the worker drains", async () => {
        actAs(ALICE.clerk);
        const res = await request(app)
            .post(`/api/v1/files/${fileId}/shares`)
            .set(auth())
            .send({ email: BOB.email, role: "viewer" });

        expect(res.status).toBe(201);
        expect(res.body.data.shared.grants).toEqual([
            { principal: { type: "user", id: bobId, email: BOB.email }, role: "viewer" },
        ]);
        // Still only queued — the overlay, not OpenFGA, is what answered.
        expect(await fakeAuthz.check({ user: `user:${bobId}`, relation: "can_read", object: `file:${fileId}` })).toBe(false);
    });

    it("lets the grantee read the file once drained", async () => {
        await drain();

        actAs(BOB.clerk);
        const res = await request(app).get(`/api/v1/files/${fileId}/download`).set(auth());
        expect(res.status).toBe(200);
        expect(res.body.data.downloadUrl).toContain("signed/");
    });

    it("does not let a viewer re-share or list the grants", async () => {
        actAs(BOB.clerk);
        const list = await request(app).get(`/api/v1/files/${fileId}/shares`).set(auth());
        expect(list.status).toBe(403);

        const reshare = await request(app)
            .post(`/api/v1/files/${fileId}/shares`)
            .set(auth())
            .send({ email: ALICE.email, role: "editor" });
        expect(reshare.status).toBe(403);
    });

    it("rejects granting to an unknown email and to the owner", async () => {
        actAs(ALICE.clerk);
        const unknown = await request(app)
            .post(`/api/v1/files/${fileId}/shares`)
            .set(auth())
            .send({ email: "nobody@blitzvault.test", role: "viewer" });
        expect(unknown.status).toBe(404);

        const owner = await request(app)
            .post(`/api/v1/files/${fileId}/shares`)
            .set(auth())
            .send({ email: ALICE.email, role: "editor" });
        expect(owner.status).toBe(409);
    });

    it("swaps the role instead of stacking grants", async () => {
        actAs(ALICE.clerk);
        const res = await request(app)
            .post(`/api/v1/files/${fileId}/shares`)
            .set(auth())
            .send({ email: BOB.email, role: "editor" });

        expect(res.status).toBe(201);
        expect(res.body.data.shared.grants).toHaveLength(1);
        expect(res.body.data.shared.grants[0].role).toBe("editor");

        await drain();
        const tuples = await fakeAuthz.readTuples({ object: `file:${fileId}` });
        expect(tuples.filter((tuple) => tuple.user === `user:${bobId}`)).toEqual([
            { user: `user:${bobId}`, relation: "editor", object: `file:${fileId}` },
        ]);
    });

    it("denies the grantee again after revoke", async () => {
        actAs(ALICE.clerk);
        const revoke = await request(app)
            .delete(`/api/v1/files/${fileId}/shares/${bobId}`)
            .set(auth());
        expect(revoke.status).toBe(200);
        expect(revoke.body.data.shared.grants).toEqual([]);

        await drain();

        actAs(BOB.clerk);
        const denied = await request(app).get(`/api/v1/files/${fileId}/download`).set(auth());
        expect(denied.status).toBe(403);
    });

    it("is idempotent when revoking a principal that has nothing", async () => {
        actAs(ALICE.clerk);
        const res = await request(app)
            .delete(`/api/v1/files/${fileId}/shares/${bobId}`)
            .set(auth());
        expect(res.status).toBe(200);

        const result = await drain();
        expect(result.failed).toBe(0);
    });
});

describe("folder sharing reaches the folder's contents", () => {
    it("grants access to a file through its parent folder", async () => {
        actAs(ALICE.clerk);
        const granted = await request(app)
            .post(`/api/v1/folders/${folderId}/shares`)
            .set(auth())
            .send({ email: BOB.email, role: "viewer" });
        expect(granted.status).toBe(201);

        await drain();

        actAs(BOB.clerk);
        const res = await request(app).get(`/api/v1/files/${fileId}/download`).set(auth());
        expect(res.status).toBe(200);
    });
});
