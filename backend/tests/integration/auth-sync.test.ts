import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock Clerk so we never hit the network: requireAuth verifies the token and the
// service fetches the Clerk user. ClerkServiceError stays real (controller does
// instanceof checks). The DB upsert is exercised for real against test Postgres.
vi.mock("../../src/shared/services/clerk.service", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../src/shared/services/clerk.service")>();
    return {
        ...actual,
        verifySessionToken: vi.fn(),
        getClerkUserById: vi.fn(),
    };
});

import { app } from "../../src/app";
import AppDataSource from "../../src/config/db";
import { Users } from "../../src/entities/Users";
import { getClerkUserById, verifySessionToken } from "../../src/shared/services/clerk.service";

const TEST_CLERK_ID = "user_test_authsync";
const TEST_EMAIL = "authsync.test@blitzvault.test";

const mockedVerify = vi.mocked(verifySessionToken);
const mockedGetUser = vi.mocked(getClerkUserById);

const fakeClerkUser = {
    id: TEST_CLERK_ID,
    username: "authsync_user",
    primaryEmailAddressId: "email_1",
    emailAddresses: [{ id: "email_1", emailAddress: TEST_EMAIL }],
} as unknown as Awaited<ReturnType<typeof getClerkUserById>>;

describe("POST /api/v1/auth/sync", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterAll(async () => {
        // Remove the row this suite created so reruns stay clean.
        await AppDataSource.getRepository(Users).delete({ clerk_user_id: TEST_CLERK_ID });
    });

    it("syncs the authenticated Clerk user and returns the legacy envelope", async () => {
        mockedVerify.mockResolvedValue({ sub: TEST_CLERK_ID, sid: "sess_1" } as never);
        mockedGetUser.mockResolvedValue(fakeClerkUser);

        const res = await request(app)
            .post("/api/v1/auth/sync")
            .set("Authorization", "Bearer faketoken");

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toBe("User synced successfully");
        expect(res.body.data.user.email).toBe(TEST_EMAIL);

        // Row actually persisted.
        const saved = await AppDataSource.getRepository(Users).findOneBy({
            clerk_user_id: TEST_CLERK_ID,
        });
        expect(saved).not.toBeNull();
    });

    it("returns 401 when no Bearer token is provided", async () => {
        const res = await request(app).post("/api/v1/auth/sync");

        expect(res.status).toBe(401);
        expect(mockedVerify).not.toHaveBeenCalled();
    });

    it("returns 401 when the token fails verification", async () => {
        mockedVerify.mockRejectedValue(new Error("invalid token"));

        const res = await request(app)
            .post("/api/v1/auth/sync")
            .set("Authorization", "Bearer badtoken");

        expect(res.status).toBe(401);
    });
});
