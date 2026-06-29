import { beforeEach, describe, expect, it, vi } from "vitest";

const getThumbnailUrl = vi.fn((key: string) => `https://cdn.test/thumb/${key}`);

vi.mock("../../src/shared/services/storage", () => ({
    createStorageAdapter: vi.fn(() => ({ getThumbnailUrl })),
}));

import { toFileResponse } from "../../src/features/files/files.mapper";
import type { Files } from "../../src/entities/Files";

const makeFile = (over: Partial<Files> = {}): Files =>
    ({
        id: "f1",
        folder_id: "fold1",
        name: "x",
        size_bytes: "10",
        mime: "image/png",
        storage_key: "users/o/f1",
        storage_provider: "cloudinary",
        checksum_sha256: null,
        status: "ready",
        owner_id: "o",
        created_at: new Date("2026-06-29T00:00:00.000Z"),
        updated_at: new Date("2026-06-29T00:00:00.000Z"),
        deleted_at: null,
        ...over,
    }) as Files;

beforeEach(() => vi.clearAllMocks());

describe("toFileResponse thumbnailUrl", () => {
    it("derives a thumbnail for image files", () => {
        const res = toFileResponse(makeFile({ mime: "image/png" }));
        expect(res.thumbnailUrl).toBe("https://cdn.test/thumb/users/o/f1");
        expect(getThumbnailUrl).toHaveBeenCalledWith("users/o/f1", "image/png");
    });

    it("derives a thumbnail for PDFs (first page)", () => {
        const res = toFileResponse(makeFile({ mime: "application/pdf" }));
        expect(res.thumbnailUrl).toBe("https://cdn.test/thumb/users/o/f1");
        expect(getThumbnailUrl).toHaveBeenCalledWith("users/o/f1", "application/pdf");
    });

    it("returns null (no adapter call) for non-previewable files", () => {
        const res = toFileResponse(makeFile({ mime: "application/zip" }));
        expect(res.thumbnailUrl).toBeNull();
        expect(getThumbnailUrl).not.toHaveBeenCalled();
    });
});
