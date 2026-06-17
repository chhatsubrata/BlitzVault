import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Cloudinary SDK so these are pure unit tests — no network, no account.
vi.mock("cloudinary", () => ({
    v2: {
        config: vi.fn(),
        utils: {
            api_sign_request: vi.fn(),
            private_download_url: vi.fn(),
        },
        api: {
            resource: vi.fn(),
        },
        uploader: {
            destroy: vi.fn(),
        },
    },
}));

import { v2 as cloudinary } from "cloudinary";
import { CloudinaryAdapter } from "../../src/shared/services/storage/cloudinary.adapter";
import { StorageAdapterError } from "../../src/shared/services/storage/types";

const CONFIG = { cloudName: "demo", apiKey: "key123", apiSecret: "secret123" };
const KEY = "users/u1/file1.png";

describe("CloudinaryAdapter", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("throws when credentials are missing", () => {
        expect(() => new CloudinaryAdapter({ cloudName: "", apiKey: "", apiSecret: "" })).toThrow(
            StorageAdapterError
        );
    });

    describe("createPresignedUpload", () => {
        it("returns a signed multipart POST target", async () => {
            vi.mocked(cloudinary.utils.api_sign_request).mockReturnValue("sig-abc");
            const adapter = new CloudinaryAdapter(CONFIG);

            const result = await adapter.createPresignedUpload({
                key: KEY,
                sizeBytes: 100,
                contentType: "image/png",
            });

            expect(result.method).toBe("POST");
            expect(result.url).toBe("https://api.cloudinary.com/v1_1/demo/auto/upload");
            expect(result.key).toBe(KEY);
            expect(result.fields).toMatchObject({
                api_key: "key123",
                signature: "sig-abc",
                public_id: KEY,
            });
            expect(result.fields?.timestamp).toBeDefined();
            expect(result.expiresAt).toBeGreaterThan(Date.now());

            // Signature is built over public_id + timestamp with the api secret.
            const [paramsToSign, secret] = vi.mocked(cloudinary.utils.api_sign_request).mock.calls[0];
            expect(paramsToSign).toMatchObject({ public_id: KEY });
            expect(secret).toBe("secret123");
        });
    });

    describe("completeUpload", () => {
        it("maps a Cloudinary resource to StorageObject", async () => {
            vi.mocked(cloudinary.api.resource).mockResolvedValue({
                bytes: 2048,
                resource_type: "image",
                format: "png",
                etag: "etag-xyz",
            } as never);
            const adapter = new CloudinaryAdapter(CONFIG);

            const obj = await adapter.completeUpload(KEY);

            expect(obj).toEqual({
                key: KEY,
                sizeBytes: 2048,
                contentType: "image/png",
                etag: "etag-xyz",
            });
        });

        it("throws 404 StorageAdapterError when the object is missing", async () => {
            vi.mocked(cloudinary.api.resource).mockRejectedValue({ http_code: 404 } as never);
            const adapter = new CloudinaryAdapter(CONFIG);

            await expect(adapter.completeUpload(KEY)).rejects.toMatchObject({
                name: "StorageAdapterError",
                statusCode: 404,
            });
        });
    });

    describe("getPresignedDownload", () => {
        it("returns a time-limited signed URL", async () => {
            vi.mocked(cloudinary.utils.private_download_url).mockReturnValue("https://dl/signed");
            const adapter = new CloudinaryAdapter(CONFIG);

            const url = await adapter.getPresignedDownload(KEY, 300);

            expect(url).toBe("https://dl/signed");
            const [publicId, format, options] = vi.mocked(
                cloudinary.utils.private_download_url
            ).mock.calls[0];
            expect(publicId).toBe(KEY);
            expect(format).toBe("png");
            expect(options.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
        });
    });

    describe("deleteObject", () => {
        it("resolves when Cloudinary reports ok", async () => {
            vi.mocked(cloudinary.uploader.destroy).mockResolvedValue({ result: "ok" } as never);
            const adapter = new CloudinaryAdapter(CONFIG);

            await expect(adapter.deleteObject(KEY)).resolves.toBeUndefined();
            expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(KEY, { resource_type: "auto" });
        });

        it("throws when Cloudinary returns an unexpected result", async () => {
            vi.mocked(cloudinary.uploader.destroy).mockResolvedValue({ result: "error" } as never);
            const adapter = new CloudinaryAdapter(CONFIG);

            await expect(adapter.deleteObject(KEY)).rejects.toBeInstanceOf(StorageAdapterError);
        });
    });
});
