import { afterEach, describe, expect, it, vi } from "vitest";

// Mutable env stub so each test can pick a STORAGE_DRIVER. createStorageAdapter
// reads env.STORAGE_DRIVER at call time, so mutating between tests is enough.
// vi.hoisted runs before the hoisted vi.mock factory, avoiding a TDZ error.
const envStub = vi.hoisted(() => ({
    STORAGE_DRIVER: "cloudinary" as "cloudinary" | "s3" | "r2",
    CLOUDINARY_CLOUD_NAME: "demo",
    CLOUDINARY_API_KEY: "key123",
    CLOUDINARY_API_SECRET: "secret123",
}));

vi.mock("../../src/shared/config/env", () => ({ env: envStub }));
vi.mock("cloudinary", () => ({ v2: { config: vi.fn() } }));

import { CloudinaryAdapter } from "../../src/shared/services/storage/cloudinary.adapter";
import { createStorageAdapter } from "../../src/shared/services/storage/factory";
import { StorageAdapterError } from "../../src/shared/services/storage/types";

describe("createStorageAdapter", () => {
    afterEach(() => {
        envStub.STORAGE_DRIVER = "cloudinary";
    });

    it("returns a CloudinaryAdapter for STORAGE_DRIVER=cloudinary", () => {
        envStub.STORAGE_DRIVER = "cloudinary";
        expect(createStorageAdapter()).toBeInstanceOf(CloudinaryAdapter);
    });

    it.each(["s3", "r2"] as const)("throws 501 for unimplemented driver %s", (driver) => {
        envStub.STORAGE_DRIVER = driver;
        try {
            createStorageAdapter();
            expect.unreachable("should have thrown");
        } catch (error) {
            expect(error).toBeInstanceOf(StorageAdapterError);
            expect((error as StorageAdapterError).statusCode).toBe(501);
        }
    });
});
