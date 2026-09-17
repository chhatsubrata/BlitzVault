import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createFakeAuthz } from "../helpers/fake-authz";

/**
 * The Week 3 Thursday acceptance: Alice mints a public link on a file, an
 * anonymous visitor opens it with NO Authorization header, Alice revokes, the
 * same URL 404s.
 *
 * Same harness as sharing.test.ts — FGA_ENABLED on, the OpenFGA client swapped
 * for the in-memory model — because with the flag off `authorize()` falls back
 * to an owner check and the wildcard accessor tuple is never consulted. What is
 * under test here is precisely that tuple chain:
 *
 *   user:*  --accessor-->  public_link:<id>  --#accessor viewer-->  file:<id>
 */
const holder = vi.hoisted(
    (): { authz: import("../helpers/fake-authz").FakeAuthz | null } => ({ authz: null })
);

vi.mock("../../src/shared/config/env", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../src/shared/config/env")>();
    return {
        ...actual,
        env: { ...actual.env, FGA_ENABLED: true, PUBLIC_APP_URL: "https://app.test" },
    };
});

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
import { Folders } from "../../src/entities/Folders";
import { ShareLinks } from "../../src/entities/ShareLinks";
import { Users } from "../../src/entities/Users";
import { createPendingFile } from "../../src/features/files/files.repository";
import { drainOutbox } from "../../src/shared/services/authz/outbox";
import { verifySessionToken } from "../../src/shared/services/clerk.service";

const fakeAuthz = createFakeAuthz();
holder.authz = fakeAuthz;

const ALICE = {
    clerk: "user_test_link_alice",
    email: "link.alice@blitzvault.test",
    username: "link_alice",
};
const BOB = {
    clerk: "user_test_link_bob",
    email: "link.bob@blitzvault.test",
    username: "link_bob",
};

const mockedVerify = vi.mocked(verifySessionToken);
const auth = () => ({ Authorization: "Bearer faketoken" });
const actAs = (clerkId: string) =>
    mockedVerify.mockResolvedValue({ sub: clerkId, sid: "sess_1" } as never);

const drain = () => drainOutbox({ authz: fakeAuthz, ds: AppDataSource });

let aliceId: string;
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

        for (const { id: resourceId } of [...files, ...folders]) {
            await AppDataSource.getRepository(ShareLinks).delete({ resource_id: resourceId });
        }
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
            users.create({
                clerk_user_id: ALICE.clerk,
                email: ALICE.email,
                username: ALICE.username,
            })
        )
    ).id;
    await users.save(
        users.create({ clerk_user_id: BOB.clerk, email: BOB.email, username: BOB.username })
    );

    actAs(ALICE.clerk);
    const created = await request(app)
        .post("/api/v1/folders")
        .set(auth())
        .send({ name: "Link Root" });
    folderId = created.body.data.folder.id;

    fileId = (
        await createPendingFile({
            id: crypto.randomUUID(),
            ownerId: aliceId,
            folderId,
            name: "public.txt",
            sizeBytes: 12,
            mime: "text/plain",
            storageKey: `users/${aliceId}/public-report`,
            storageProvider: "cloudinary",
            checksumSha256: null,
        })
    ).id;
    await AppDataSource.getRepository(Files).update({ id: fileId }, { status: "ready" });

    // Owner tuples must be live before anything is shared.
    await drain();
});

afterAll(purgeFixtures);

/** The whole point: no Authorization header. */
const anonymousGet = (token: string) => request(app).get(`/api/v1/links/${token}`);

describe("public link lifecycle", () => {
    let token: string;

    it("reports no public link before one is minted", async () => {
        actAs(ALICE.clerk);
        const res = await request(app).get(`/api/v1/files/${fileId}/shares`).set(auth());

        expect(res.status).toBe(200);
        expect(res.body.data.shared.publicLink).toBeNull();
    });

    it("refuses to mint a link for someone who cannot share", async () => {
        actAs(BOB.clerk);
        const res = await request(app)
            .post(`/api/v1/files/${fileId}/shares/link`)
            .set(auth())
            .send({});

        expect(res.status).toBe(403);
    });

    it("mints a link for the owner", async () => {
        actAs(ALICE.clerk);
        const res = await request(app)
            .post(`/api/v1/files/${fileId}/shares/link`)
            .set(auth())
            .send({});

        expect(res.status).toBe(201);
        const link = res.body.data.shared.publicLink;
        expect(link.role).toBe("viewer");
        // 32 random bytes as base64url.
        expect(link.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(link.url).toBe(`https://app.test/l/${link.token}`);

        token = link.token;
    });

    it("returns the same link on a repeat click instead of rotating it", async () => {
        actAs(ALICE.clerk);
        const res = await request(app)
            .post(`/api/v1/files/${fileId}/shares/link`)
            .set(auth())
            .send({});

        // 200, not 201 — nothing was created.
        expect(res.status).toBe(200);
        expect(res.body.data.shared.publicLink.token).toBe(token);
    });

    it("surfaces the link on the share list for the copy affordance", async () => {
        actAs(ALICE.clerk);
        const res = await request(app).get(`/api/v1/files/${fileId}/shares`).set(auth());

        expect(res.body.data.shared.publicLink.token).toBe(token);
    });

    it("queues the three tuples that make the link work", async () => {
        const linkRow = await AppDataSource.getRepository(ShareLinks).findOneByOrFail({ token });
        const object = `public_link:${linkRow.id}`;

        const rows = await AppDataSource.query(
            "SELECT tuple FROM fga_outbox WHERE tuple->>'object' = $1 OR tuple->>'user' = $2",
            [object, `${object}#accessor`]
        );
        const tuples = rows.map((row: { tuple: Record<string, string> }) => row.tuple);

        expect(tuples).toContainEqual({
            user: `file:${fileId}`,
            relation: "resource",
            object,
        });
        expect(tuples).toContainEqual({
            user: `${object}#accessor`,
            relation: "viewer",
            object: `file:${fileId}`,
        });
        expect(tuples).toContainEqual({ user: "user:*", relation: "accessor", object });
    });

    it("opens the file for an anonymous visitor once drained", async () => {
        const result = await drain();
        expect(result.failed).toBe(0);

        const res = await anonymousGet(token);

        expect(res.status).toBe(200);
        expect(res.body.data.link.kind).toBe("file");
        expect(res.body.data.link.role).toBe("viewer");
        expect(res.body.data.link.file.name).toBe("public.txt");
        expect(res.body.data.link.downloadUrl).toContain("https://cdn.test/signed/");
    });

    it("404s an unknown token without revealing anything", async () => {
        const res = await anonymousGet("A".repeat(43));

        expect(res.status).toBe(404);
        expect(res.body.error.message).toBe("Link not found.");
    });

    it("400s a malformed token before it reaches the database", async () => {
        const res = await anonymousGet("short");

        expect(res.status).toBe(400);
    });

    it("cuts anonymous access off when revoked", async () => {
        actAs(ALICE.clerk);
        const revoked = await request(app)
            .delete(`/api/v1/files/${fileId}/shares/link`)
            .set(auth());

        expect(revoked.status).toBe(200);
        expect(revoked.body.data.shared.publicLink).toBeNull();

        await drain();

        const res = await anonymousGet(token);
        expect(res.status).toBe(404);
        // Byte-identical to an unknown token: a revoked link must not be
        // distinguishable from one that never existed.
        expect(res.body.error.message).toBe("Link not found.");
    });

    it("mints a fresh token after a revoke", async () => {
        actAs(ALICE.clerk);
        const res = await request(app)
            .post(`/api/v1/files/${fileId}/shares/link`)
            .set(auth())
            .send({});

        expect(res.status).toBe(201);
        expect(res.body.data.shared.publicLink.token).not.toBe(token);
    });

    it("rejects an unknown body field rather than ignoring it", async () => {
        actAs(ALICE.clerk);
        const res = await request(app)
            .post(`/api/v1/files/${fileId}/shares/link`)
            .set(auth())
            .send({ expiresAt: "2030-01-01T00:00:00.000Z" });

        // Expiry has a column but no agreed request shape yet — silently
        // accepting it would promise something nothing honours.
        expect(res.status).toBe(400);
    });
});

describe("public folder link", () => {
    it("resolves to folder metadata only", async () => {
        actAs(ALICE.clerk);
        const created = await request(app)
            .post(`/api/v1/folders/${folderId}/shares/link`)
            .set(auth())
            .send({});
        expect(created.status).toBe(201);

        await drain();

        const res = await anonymousGet(created.body.data.shared.publicLink.token);

        expect(res.status).toBe(200);
        expect(res.body.data.link.kind).toBe("folder");
        expect(res.body.data.link.folder.name).toBe("Link Root");
        // Listing children is a separate endpoint — it needs pagination and
        // per-item filtering of its own.
        expect(res.body.data.link.downloadUrl).toBeUndefined();
    });
});

describe("deleted resources", () => {
    it("404s a link whose file was trashed", async () => {
        actAs(ALICE.clerk);
        const doomed = (
            await createPendingFile({
                id: crypto.randomUUID(),
                ownerId: aliceId,
                folderId,
                name: "doomed.txt",
                sizeBytes: 3,
                mime: "text/plain",
                storageKey: `users/${aliceId}/doomed`,
                storageProvider: "cloudinary",
                checksumSha256: null,
            })
        ).id;
        await AppDataSource.getRepository(Files).update({ id: doomed }, { status: "ready" });
        await drain();

        const created = await request(app)
            .post(`/api/v1/files/${doomed}/shares/link`)
            .set(auth())
            .send({});
        await drain();

        const doomedToken = created.body.data.shared.publicLink.token;
        expect((await anonymousGet(doomedToken)).status).toBe(200);

        await request(app).delete(`/api/v1/files/${doomed}`).set(auth());

        // The tuples still exist — the resource is what went away, which is why
        // resolve checks the row's resource as well as the grant.
        const res = await anonymousGet(doomedToken);
        expect(res.status).toBe(404);
    });
});
