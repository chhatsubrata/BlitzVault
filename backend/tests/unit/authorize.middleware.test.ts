import type { NextFunction, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Real env (so setup.ts can still open the DB), with FGA_ENABLED toggled per test.
const envStub = vi.hoisted(() => ({ FGA_ENABLED: true }));
vi.mock("../../src/shared/config/env", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../src/shared/config/env")>();
    return {
        ...actual,
        env: new Proxy(actual.env, {
            get: (target, key) =>
                key === "FGA_ENABLED" ? envStub.FGA_ENABLED : Reflect.get(target, key),
        }),
    };
});

// The engine: drive check() per test.
const checkStub = vi.hoisted(() => vi.fn());
vi.mock("../../src/shared/services/authz", () => ({
    getAuthorizationService: () => ({ check: checkStub }),
}));

import { ForbiddenError } from "../../src/shared/errors/AppError";
import { authorize } from "../../src/shared/middleware/authorize";

const OWNER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const FOLDER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

type Ctx = { req: Request; res: Response; next: NextFunction & ReturnType<typeof vi.fn> };

const build = (overrides: Partial<Request> = {}): Ctx => {
    const req = {
        auth: { clerkUserId: "user_clerk", token: "t", userId: OWNER },
        resource: { kind: "folder", id: FOLDER, ownerId: OWNER },
        log: { warn: vi.fn() },
        ...overrides,
    } as unknown as Request;
    return { req, res: {} as Response, next: vi.fn() };
};

const errorPassedTo = (next: ReturnType<typeof vi.fn>): unknown => next.mock.calls[0]?.[0];

describe("authorize() with OpenFGA enabled", () => {
    beforeEach(() => {
        envStub.FGA_ENABLED = true;
    });
    afterEach(() => vi.clearAllMocks());

    it("passes when check allows, and asks with namespaced ids", async () => {
        checkStub.mockResolvedValue(true);
        const { req, res, next } = build();

        await authorize("can_write")(req, res, next);

        expect(errorPassedTo(next)).toBeUndefined();
        expect(checkStub).toHaveBeenCalledWith({
            user: `user:${OWNER}`,
            relation: "can_write",
            object: `folder:${FOLDER}`,
        });
    });

    it("403s when check denies", async () => {
        checkStub.mockResolvedValue(false);
        const { req, res, next } = build();

        await authorize("can_read")(req, res, next);

        expect(errorPassedTo(next)).toBeInstanceOf(ForbiddenError);
    });

    it("403s — not 502 — when the engine throws, and logs it", async () => {
        checkStub.mockRejectedValue(new Error("connection refused"));
        const { req, res, next } = build();

        await authorize("can_read")(req, res, next);

        expect(errorPassedTo(next)).toBeInstanceOf(ForbiddenError);
        expect((req.log as unknown as { warn: ReturnType<typeof vi.fn> }).warn).toHaveBeenCalled();
    });

    it("403s when loadResource did not run (no req.resource)", async () => {
        checkStub.mockResolvedValue(true);
        const { req, res, next } = build({ resource: undefined });

        await authorize("can_read")(req, res, next);

        expect(errorPassedTo(next)).toBeInstanceOf(ForbiddenError);
        expect(checkStub).not.toHaveBeenCalled();
    });

    it("ignores ownership entirely — a non-owner the engine allows passes", async () => {
        checkStub.mockResolvedValue(true);
        const { req, res, next } = build({
            auth: { clerkUserId: "user_clerk", token: "t", userId: OTHER },
        });

        await authorize("can_read")(req, res, next);

        expect(errorPassedTo(next)).toBeUndefined();
    });
});

describe("authorize() with OpenFGA disabled (transitional owner fallback)", () => {
    beforeEach(() => {
        envStub.FGA_ENABLED = false;
    });
    afterEach(() => vi.clearAllMocks());

    it("allows the owner without touching the engine", async () => {
        const { req, res, next } = build();

        await authorize("can_delete")(req, res, next);

        expect(errorPassedTo(next)).toBeUndefined();
        expect(checkStub).not.toHaveBeenCalled();
    });

    it("denies a non-owner", async () => {
        const { req, res, next } = build({
            auth: { clerkUserId: "user_clerk", token: "t", userId: OTHER },
        });

        await authorize("can_read")(req, res, next);

        expect(errorPassedTo(next)).toBeInstanceOf(ForbiddenError);
        expect(checkStub).not.toHaveBeenCalled();
    });
});
