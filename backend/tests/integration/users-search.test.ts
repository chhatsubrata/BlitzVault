import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../src/shared/services/clerk.service", async (importOriginal) => {
    const actual =
        await importOriginal<typeof import("../../src/shared/services/clerk.service")>();
    return { ...actual, verifySessionToken: vi.fn() };
});

import { app } from "../../src/app";
import AppDataSource from "../../src/config/db";
import { Users } from "../../src/entities/Users";
import { verifySessionToken } from "../../src/shared/services/clerk.service";

/**
 * GET /users/search — the member picker's typeahead. What matters here is what
 * it refuses to do: leak `clerk_user_id`, offer the caller themselves, or scan
 * the table for a one-character term.
 */

const CALLER = {
    clerk: "user_test_search_caller",
    email: "search.caller@blitzvault.test",
    username: "search_caller",
};
const TARGET = {
    clerk: "user_test_search_target",
    email: "search.target@blitzvault.test",
    username: "search_target_handle",
};

const mockedVerify = vi.mocked(verifySessionToken);
const auth = () => ({ Authorization: "Bearer faketoken" });

const purgeFixtures = async (): Promise<void> => {
    await AppDataSource.getRepository(Users).delete({ clerk_user_id: CALLER.clerk });
    await AppDataSource.getRepository(Users).delete({ clerk_user_id: TARGET.clerk });
};

beforeAll(async () => {
    await purgeFixtures();
    const users = AppDataSource.getRepository(Users);
    await users.save([
        users.create({ clerk_user_id: CALLER.clerk, email: CALLER.email, username: CALLER.username }),
        users.create({ clerk_user_id: TARGET.clerk, email: TARGET.email, username: TARGET.username }),
    ]);
    mockedVerify.mockResolvedValue({ sub: CALLER.clerk, sid: "sess_1" } as never);
});

afterAll(purgeFixtures);

describe("GET /api/v1/users/search", () => {
    it("matches on email and returns only picker fields", async () => {
        const res = await request(app)
            .get("/api/v1/users/search?q=search.target")
            .set(auth());

        expect(res.status).toBe(200);
        const [user] = res.body.data.users;
        expect(user).toEqual({
            id: expect.any(String),
            email: TARGET.email,
            username: TARGET.username,
            // Fixture users have no Clerk photo; the picker draws initials.
            avatarUrl: null,
        });
        // An auth identifier has no business in another user's browser.
        expect(JSON.stringify(res.body)).not.toContain("clerk_user_id");
    });

    it("matches on username too", async () => {
        const res = await request(app)
            .get("/api/v1/users/search?q=target_handle")
            .set(auth());

        expect(res.status).toBe(200);
        expect(res.body.data.users.map((user: { email: string }) => user.email)).toEqual([
            TARGET.email,
        ]);
    });

    it("never offers the caller themselves", async () => {
        const res = await request(app)
            .get("/api/v1/users/search?q=search.")
            .set(auth());

        expect(res.status).toBe(200);
        const emails = res.body.data.users.map((user: { email: string }) => user.email);
        expect(emails).toContain(TARGET.email);
        expect(emails).not.toContain(CALLER.email);
    });

    it("400s a term shorter than two characters", async () => {
        const res = await request(app).get("/api/v1/users/search?q=a").set(auth());
        expect(res.status).toBe(400);
    });

    it("400s a limit above the cap", async () => {
        const res = await request(app)
            .get("/api/v1/users/search?q=search.&limit=50")
            .set(auth());
        expect(res.status).toBe(400);
    });

    it("401s without a token", async () => {
        const res = await request(app).get("/api/v1/users/search?q=search.");
        expect(res.status).toBe(401);
    });

    it("treats LIKE wildcards as literal text", async () => {
        const res = await request(app).get("/api/v1/users/search?q=%25%25").set(auth());
        expect(res.status).toBe(200);
        // "%%" would match every row if the term were interpolated raw.
        expect(res.body.data.users).toEqual([]);
    });
});
