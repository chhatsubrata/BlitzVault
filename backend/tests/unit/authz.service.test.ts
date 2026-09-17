import { afterEach, describe, expect, it, vi } from "vitest";

// Mutable env stub — createAuthorizationService reads env at call time, so we
// mutate between tests. vi.hoisted runs before the hoisted vi.mock factory.
const envStub = vi.hoisted(() => ({
    FGA_ENABLED: false,
    FGA_API_URL: "http://localhost:8080",
    FGA_STORE_ID: "store_1",
    FGA_MODEL_ID: "model_1",
}));

// Mock the OpenFGA SDK: capture the constructed client so tests drive its methods.
const sdkStub = vi.hoisted(() => ({
    check: vi.fn(),
    batchCheck: vi.fn(),
    write: vi.fn(),
    read: vi.fn(),
}));

vi.mock("../../src/shared/config/env", () => ({ env: envStub }));
vi.mock("@openfga/sdk", () => ({
    // Regular function (not an arrow) so `new OpenFgaClient()` is constructable;
    // returning an object makes `new` yield the shared stub.
    OpenFgaClient: vi.fn(function () {
        return sdkStub;
    }),
    CredentialsMethod: { None: "none" },
}));

import { UpstreamError } from "../../src/shared/errors/AppError";
import { createAuthorizationService } from "../../src/shared/services/authz/factory";
import { FgaAuthorizationService } from "../../src/shared/services/authz/fga.adapter";
import { DisabledAuthorizationService } from "../../src/shared/services/authz/noop.adapter";

const OWNER = { user: "user:alice", relation: "can_read", object: "file:1" };

describe("createAuthorizationService", () => {
    afterEach(() => {
        envStub.FGA_ENABLED = false;
        envStub.FGA_API_URL = "http://localhost:8080";
        envStub.FGA_STORE_ID = "store_1";
        envStub.FGA_MODEL_ID = "model_1";
        vi.clearAllMocks();
    });

    it("returns the deny-by-default stub when FGA_ENABLED=false", async () => {
        const svc = createAuthorizationService();
        expect(svc).toBeInstanceOf(DisabledAuthorizationService);
        expect(await svc.check(OWNER)).toBe(false);
        expect(await svc.batchCheck([OWNER, OWNER])).toEqual([false, false]);
        expect(await svc.readTuples({ object: "file:1" })).toEqual([]);
        await expect(svc.write({ writes: [OWNER] })).resolves.toBeUndefined();
    });

    it("returns the live adapter when FGA_ENABLED=true", () => {
        envStub.FGA_ENABLED = true;
        expect(createAuthorizationService()).toBeInstanceOf(FgaAuthorizationService);
    });

    it("throws UpstreamError when enabled but misconfigured", () => {
        envStub.FGA_ENABLED = true;
        envStub.FGA_STORE_ID = "";
        expect(() => createAuthorizationService()).toThrow(UpstreamError);
    });
});

describe("FgaAuthorizationService", () => {
    afterEach(() => vi.clearAllMocks());

    const build = () =>
        new FgaAuthorizationService({
            apiUrl: "http://localhost:8080",
            storeId: "store_1",
            modelId: "model_1",
        });

    it("check returns the SDK allowed flag", async () => {
        sdkStub.check.mockResolvedValue({ allowed: true });
        expect(await build().check(OWNER)).toBe(true);
    });

    it("check denies by default when allowed is undefined", async () => {
        sdkStub.check.mockResolvedValue({});
        expect(await build().check(OWNER)).toBe(false);
    });

    it("check wraps SDK failure as UpstreamError", async () => {
        sdkStub.check.mockRejectedValue(new Error("connection refused"));
        await expect(build().check(OWNER)).rejects.toBeInstanceOf(UpstreamError);
    });

    it("batchCheck maps results back to input order by correlationId", async () => {
        sdkStub.batchCheck.mockResolvedValue({
            result: [
                { correlationId: "c1", allowed: true },
                { correlationId: "c0", allowed: false },
            ],
        });
        const out = await build().batchCheck([
            { user: "user:a", relation: "can_read", object: "file:1" },
            { user: "user:a", relation: "can_read", object: "file:2" },
        ]);
        expect(out).toEqual([false, true]);
    });

    it("batchCheck short-circuits on empty input", async () => {
        expect(await build().batchCheck([])).toEqual([]);
        expect(sdkStub.batchCheck).not.toHaveBeenCalled();
    });

    it("write skips the SDK call when nothing to write or delete", async () => {
        await build().write({});
        expect(sdkStub.write).not.toHaveBeenCalled();
    });

    it("write swallows benign duplicate-write conflicts (idempotent)", async () => {
        sdkStub.write.mockRejectedValue({
            responseData: { code: "write_failed_due_to_invalid_input" },
        });
        await expect(build().write({ writes: [OWNER] })).resolves.toBeUndefined();
    });

    it("write rethrows real failures as UpstreamError", async () => {
        sdkStub.write.mockRejectedValue(new Error("500 internal"));
        await expect(build().write({ writes: [OWNER] })).rejects.toBeInstanceOf(
            UpstreamError
        );
    });

    it("readTuples follows the continuation token to the last page", async () => {
        sdkStub.read
            .mockResolvedValueOnce({
                tuples: [{ key: { user: "user:a", relation: "viewer", object: "file:1" } }],
                continuation_token: "next",
            })
            .mockResolvedValueOnce({
                tuples: [{ key: { user: "user:b", relation: "editor", object: "file:1" } }],
                continuation_token: "",
            });

        const out = await build().readTuples({ object: "file:1" });

        expect(out).toEqual([
            { user: "user:a", relation: "viewer", object: "file:1" },
            { user: "user:b", relation: "editor", object: "file:1" },
        ]);
        // A truncated share list would silently hide who has access.
        expect(sdkStub.read).toHaveBeenCalledTimes(2);
        expect(sdkStub.read.mock.calls[1][1]).toMatchObject({ continuationToken: "next" });
    });

    it("readTuples wraps SDK failure as UpstreamError", async () => {
        sdkStub.read.mockRejectedValue(new Error("connection refused"));
        await expect(build().readTuples({ object: "file:1" })).rejects.toBeInstanceOf(
            UpstreamError
        );
    });
});
