import { describe, expect, it } from "vitest";

import { CloudinaryAdapter } from "../../src/shared/services/storage/cloudinary.adapter";

// Pure URL build — no network. Fake creds are enough for cloudinary.url().
const adapter = new CloudinaryAdapter({
    cloudName: "demo",
    apiKey: "key",
    apiSecret: "secret",
});

describe("CloudinaryAdapter.getThumbnailUrl", () => {
    it("builds a delivery URL with the thumbnail transform + key", () => {
        const url = adapter.getThumbnailUrl("users/abc/file-1");

        expect(url).toContain("res.cloudinary.com/demo");
        // Cloudinary serializes transform params alphabetically.
        expect(url).toContain("c_fill");
        expect(url).toContain("w_320");
        expect(url).toContain("h_320");
        expect(url).toContain("users/abc/file-1");
        expect(url.startsWith("https://")).toBe(true);
    });

    it("rasterizes page 1 for PDFs", () => {
        const url = adapter.getThumbnailUrl("users/abc/doc-1", "application/pdf");

        expect(url).toContain("pg_1");
        expect(url).toContain("users/abc/doc-1");
        expect(url).toMatch(/\.jpg/);
    });
});
