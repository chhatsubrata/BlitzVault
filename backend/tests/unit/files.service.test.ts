import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock every external boundary so the service is tested in isolation: DB
// (repository), storage adapter, and the idempotency store.
vi.mock("../../src/features/files/files.repository", () => ({
    findOwnerIdByClerkId: vi.fn(),
    folderExistsForOwner: vi.fn(),
    createPendingFile: vi.fn(),
    findOwnedFileById: vi.fn(),
    markFileReady: vi.fn(),
}));

vi.mock("../../src/shared/services/storage", () => ({
    createStorageAdapter: vi.fn(),
}));

vi.mock("../../src/shared/services/idempotency", () => ({
    readIdempotent: vi.fn(),
    writeIdempotent: vi.fn(),
}));

import {
    completeUploadService,
    initUploadService,
} from "../../src/features/files/files.service";
import {
    createPendingFile,
    findOwnedFileById,
    findOwnerIdByClerkId,
    folderExistsForOwner,
    markFileReady,
} from "../../src/features/files/files.repository";
import { createStorageAdapter } from "../../src/shared/services/storage";
import { StorageAdapterError } from "../../src/shared/services/storage/types";
import {
    readIdempotent,
    writeIdempotent,
} from "../../src/shared/services/idempotency";
import {
    ConflictError,
    NotFoundError,
    QuotaExceededError,
} from "../../src/shared/errors/AppError";
import type { Files } from "../../src/entities/Files";

const CLERK_ID = "user_clerk_1";
const OWNER_ID = "11111111-1111-1111-1111-111111111111";
const FOLDER_ID = "22222222-2222-2222-2222-222222222222";
const IDEMPOTENCY_KEY = "idem-key-1";

const mockedFindOwner = vi.mocked(findOwnerIdByClerkId);
const mockedFolderExists = vi.mocked(folderExistsForOwner);
const mockedCreatePending = vi.mocked(createPendingFile);
const mockedFindFile = vi.mocked(findOwnedFileById);
const mockedMarkReady = vi.mocked(markFileReady);
const mockedCreateAdapter = vi.mocked(createStorageAdapter);
const mockedReadIdem = vi.mocked(readIdempotent);
const mockedWriteIdem = vi.mocked(writeIdempotent);

const presigned = {
    url: "https://api.cloudinary.com/v1_1/demo/auto/upload",
    method: "POST" as const,
    headers: {},
    fields: { api_key: "key", signature: "sig", timestamp: "1", public_id: "k" },
    key: "k",
    expiresAt: 123,
};

const makeAdapter = (over: Partial<Record<string, unknown>> = {}) =>
    ({
        createPresignedUpload: vi.fn().mockResolvedValue(presigned),
        completeUpload: vi.fn().mockResolvedValue({
            key: "k",
            sizeBytes: 2048,
            contentType: "image/png",
            etag: "etag",
        }),
        getPresignedDownload: vi.fn(),
        deleteObject: vi.fn(),
        getThumbnailUrl: vi.fn().mockReturnValue("https://cdn.test/thumb"),
        ...over,
    }) as unknown as ReturnType<typeof createStorageAdapter>;

const initInput = {
    folderId: FOLDER_ID,
    name: "photo.png",
    sizeBytes: 1024,
    mime: "image/png",
};

const makeFile = (over: Partial<Files> = {}): Files =>
    ({
        id: "33333333-3333-3333-3333-333333333333",
        workspace_id: null,
        folder_id: FOLDER_ID,
        name: "photo.png",
        size_bytes: "1024",
        mime: "image/png",
        storage_key: `users/${OWNER_ID}/file`,
        storage_provider: "cloudinary",
        checksum_sha256: null,
        status: "pending",
        owner_id: OWNER_ID,
        created_at: new Date("2026-06-23T00:00:00.000Z"),
        updated_at: new Date("2026-06-23T00:00:00.000Z"),
        deleted_at: null,
        folder: undefined as never,
        ...over,
    }) as Files;

beforeEach(() => {
    vi.clearAllMocks();
    mockedFindOwner.mockResolvedValue(OWNER_ID);
    mockedFolderExists.mockResolvedValue(true);
    mockedReadIdem.mockResolvedValue(null);
    mockedWriteIdem.mockResolvedValue(undefined);
    mockedCreateAdapter.mockReturnValue(makeAdapter());
});

describe("initUploadService", () => {
    it("creates a pending row and returns a presigned target", async () => {
        mockedCreatePending.mockImplementation((input) =>
            Promise.resolve(makeFile({ id: input.id }))
        );

        const result = await initUploadService(CLERK_ID, IDEMPOTENCY_KEY, initInput);

        expect(result.fileId).toMatch(/[0-9a-f-]{36}/);
        expect(result.upload.url).toBe(presigned.url);
        expect(mockedCreatePending).toHaveBeenCalledWith(
            expect.objectContaining({
                ownerId: OWNER_ID,
                folderId: FOLDER_ID,
                storageProvider: "cloudinary",
                storageKey: `users/${OWNER_ID}/${result.fileId}`,
            })
        );
        expect(mockedWriteIdem).toHaveBeenCalledOnce();
    });

    it("returns the cached response and skips the insert on idempotent replay", async () => {
        const cached = { fileId: "cached-id", upload: presigned };
        mockedReadIdem.mockResolvedValue(cached);

        const result = await initUploadService(CLERK_ID, IDEMPOTENCY_KEY, initInput);

        expect(result).toBe(cached);
        expect(mockedCreatePending).not.toHaveBeenCalled();
        expect(mockedWriteIdem).not.toHaveBeenCalled();
    });

    it("rejects a missing folder with NotFoundError", async () => {
        mockedFolderExists.mockResolvedValue(false);

        await expect(
            initUploadService(CLERK_ID, IDEMPOTENCY_KEY, initInput)
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(mockedCreatePending).not.toHaveBeenCalled();
    });

    it("rejects an oversized file with QuotaExceededError", async () => {
        await expect(
            initUploadService(CLERK_ID, IDEMPOTENCY_KEY, {
                ...initInput,
                sizeBytes: Number.MAX_SAFE_INTEGER,
            })
        ).rejects.toBeInstanceOf(QuotaExceededError);
    });
});

describe("completeUploadService", () => {
    it("verifies storage and flips the row to ready", async () => {
        const pending = makeFile({ status: "pending" });
        mockedFindFile.mockResolvedValue(pending);
        mockedMarkReady.mockImplementation((file, size) =>
            Promise.resolve(makeFile({ status: "ready", size_bytes: String(size) }))
        );

        const result = await completeUploadService(CLERK_ID, {
            fileId: pending.id,
        });

        expect(result.status).toBe("ready");
        expect(result.sizeBytes).toBe("2048");
        expect(mockedMarkReady).toHaveBeenCalledWith(pending, 2048);
    });

    it("is idempotent: a ready file returns without touching storage", async () => {
        const ready = makeFile({ status: "ready" });
        const adapter = makeAdapter();
        mockedCreateAdapter.mockReturnValue(adapter);
        mockedFindFile.mockResolvedValue(ready);

        const result = await completeUploadService(CLERK_ID, { fileId: ready.id });

        expect(result.status).toBe("ready");
        expect(adapter.completeUpload).not.toHaveBeenCalled();
        expect(mockedMarkReady).not.toHaveBeenCalled();
    });

    it("rejects an unknown file with NotFoundError", async () => {
        mockedFindFile.mockResolvedValue(null);

        await expect(
            completeUploadService(CLERK_ID, {
                fileId: "44444444-4444-4444-4444-444444444444",
            })
        ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("maps a missing storage object (404) to ConflictError", async () => {
        mockedFindFile.mockResolvedValue(makeFile({ status: "pending" }));
        mockedCreateAdapter.mockReturnValue(
            makeAdapter({
                completeUpload: vi
                    .fn()
                    .mockRejectedValue(new StorageAdapterError("not found", 404)),
            })
        );

        await expect(
            completeUploadService(CLERK_ID, {
                fileId: "33333333-3333-3333-3333-333333333333",
            })
        ).rejects.toBeInstanceOf(ConflictError);
    });
});
