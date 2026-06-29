import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the repository so the service is tested in isolation from the DB.
vi.mock("../../src/features/folders/folders.repository", () => ({
    findOwnerIdByClerkId: vi.fn(),
    findOwnedFolderById: vi.fn(),
    createFolder: vi.fn(),
    renameFolder: vi.fn(),
    moveFolder: vi.fn(),
    collectSubtreeIds: vi.fn(),
    collectAncestors: vi.fn(),
    softDeleteSubtree: vi.fn(),
    // findFoldersPage is unused by the mutation services under test.
    findFoldersPage: vi.fn(),
}));

import {
    createFolderService,
    deleteFolderService,
    folderPathService,
    moveFolderService,
    renameFolderService,
} from "../../src/features/folders/folders.service";
import {
    collectAncestors,
    collectSubtreeIds,
    createFolder,
    findOwnedFolderById,
    findOwnerIdByClerkId,
    moveFolder,
    renameFolder,
    softDeleteSubtree,
} from "../../src/features/folders/folders.repository";
import { ConflictError, NotFoundError } from "../../src/shared/errors/AppError";
import type { Folders } from "../../src/entities/Folders";

const CLERK_ID = "user_clerk_1";
const OWNER_ID = "11111111-1111-1111-1111-111111111111";
const FOLDER_ID = "22222222-2222-2222-2222-222222222222";
const PARENT_ID = "33333333-3333-3333-3333-333333333333";

const mockedFindOwner = vi.mocked(findOwnerIdByClerkId);
const mockedFindFolder = vi.mocked(findOwnedFolderById);
const mockedCreate = vi.mocked(createFolder);
const mockedRename = vi.mocked(renameFolder);
const mockedMove = vi.mocked(moveFolder);
const mockedCollectSubtree = vi.mocked(collectSubtreeIds);
const mockedCollectAncestors = vi.mocked(collectAncestors);
const mockedSoftDelete = vi.mocked(softDeleteSubtree);

const makeFolder = (over: Partial<Folders> = {}): Folders =>
    ({
        id: FOLDER_ID,
        workspace_id: null,
        parent_id: null,
        parent: null,
        name: "Docs",
        owner_id: OWNER_ID,
        created_at: new Date("2026-06-24T00:00:00.000Z"),
        updated_at: new Date("2026-06-24T00:00:00.000Z"),
        deleted_at: null,
        ...over,
    }) as Folders;

beforeEach(() => {
    vi.clearAllMocks();
    mockedFindOwner.mockResolvedValue(OWNER_ID);
});

describe("createFolderService", () => {
    it("creates a root folder when no parentId is given", async () => {
        mockedCreate.mockResolvedValue(makeFolder({ name: "New" }));

        const result = await createFolderService(CLERK_ID, { name: "New" });

        expect(result.name).toBe("New");
        expect(mockedCreate).toHaveBeenCalledWith({
            ownerId: OWNER_ID,
            name: "New",
            parentId: null,
        });
        expect(mockedFindFolder).not.toHaveBeenCalled();
    });

    it("creates a child folder under an owned parent", async () => {
        mockedFindFolder.mockResolvedValue(makeFolder({ id: PARENT_ID }));
        mockedCreate.mockResolvedValue(makeFolder({ parent_id: PARENT_ID }));

        const result = await createFolderService(CLERK_ID, {
            name: "Child",
            parentId: PARENT_ID,
        });

        expect(result.parentId).toBe(PARENT_ID);
        expect(mockedFindFolder).toHaveBeenCalledWith(OWNER_ID, PARENT_ID);
    });

    it("rejects a missing parent with NotFoundError", async () => {
        mockedFindFolder.mockResolvedValue(null);

        await expect(
            createFolderService(CLERK_ID, { name: "X", parentId: PARENT_ID })
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(mockedCreate).not.toHaveBeenCalled();
    });

    it("rejects an unsynced user with NotFoundError", async () => {
        mockedFindOwner.mockResolvedValue(null);

        await expect(
            createFolderService(CLERK_ID, { name: "X" })
        ).rejects.toBeInstanceOf(NotFoundError);
    });
});

describe("renameFolderService", () => {
    it("renames an owned folder and returns the updated row", async () => {
        mockedFindFolder
            .mockResolvedValueOnce(makeFolder())
            .mockResolvedValueOnce(makeFolder({ name: "Renamed" }));
        mockedRename.mockResolvedValue(undefined);

        const result = await renameFolderService(CLERK_ID, FOLDER_ID, {
            name: "Renamed",
        });

        expect(result.name).toBe("Renamed");
        expect(mockedRename).toHaveBeenCalledWith(FOLDER_ID, "Renamed");
    });

    it("rejects a missing folder with NotFoundError", async () => {
        mockedFindFolder.mockResolvedValue(null);

        await expect(
            renameFolderService(CLERK_ID, FOLDER_ID, { name: "Y" })
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(mockedRename).not.toHaveBeenCalled();
    });
});

describe("moveFolderService", () => {
    it("moves a folder to root (parentId null) without a cycle check", async () => {
        mockedFindFolder
            .mockResolvedValueOnce(makeFolder({ parent_id: PARENT_ID }))
            .mockResolvedValueOnce(makeFolder({ parent_id: null }));
        mockedMove.mockResolvedValue(undefined);

        const result = await moveFolderService(CLERK_ID, FOLDER_ID, {
            parentId: null,
        });

        expect(result.parentId).toBeNull();
        expect(mockedMove).toHaveBeenCalledWith(FOLDER_ID, null);
        expect(mockedCollectSubtree).not.toHaveBeenCalled();
    });

    it("moves a folder under another owned parent", async () => {
        mockedFindFolder
            .mockResolvedValueOnce(makeFolder()) // the folder being moved
            .mockResolvedValueOnce(makeFolder({ id: PARENT_ID })) // target parent
            .mockResolvedValueOnce(makeFolder({ parent_id: PARENT_ID })); // reload
        mockedCollectSubtree.mockResolvedValue([FOLDER_ID]);
        mockedMove.mockResolvedValue(undefined);

        const result = await moveFolderService(CLERK_ID, FOLDER_ID, {
            parentId: PARENT_ID,
        });

        expect(result.parentId).toBe(PARENT_ID);
        expect(mockedMove).toHaveBeenCalledWith(FOLDER_ID, PARENT_ID);
    });

    it("rejects moving a folder into itself with ConflictError", async () => {
        mockedFindFolder
            .mockResolvedValueOnce(makeFolder())
            .mockResolvedValueOnce(makeFolder({ id: FOLDER_ID }));
        mockedCollectSubtree.mockResolvedValue([FOLDER_ID]);

        await expect(
            moveFolderService(CLERK_ID, FOLDER_ID, { parentId: FOLDER_ID })
        ).rejects.toBeInstanceOf(ConflictError);
        expect(mockedMove).not.toHaveBeenCalled();
    });

    it("rejects moving a folder into its own descendant with ConflictError", async () => {
        mockedFindFolder
            .mockResolvedValueOnce(makeFolder())
            .mockResolvedValueOnce(makeFolder({ id: PARENT_ID }));
        // PARENT_ID is a descendant of FOLDER_ID -> cycle.
        mockedCollectSubtree.mockResolvedValue([FOLDER_ID, PARENT_ID]);

        await expect(
            moveFolderService(CLERK_ID, FOLDER_ID, { parentId: PARENT_ID })
        ).rejects.toBeInstanceOf(ConflictError);
        expect(mockedMove).not.toHaveBeenCalled();
    });

    it("rejects a missing target parent with NotFoundError", async () => {
        mockedFindFolder
            .mockResolvedValueOnce(makeFolder()) // folder exists
            .mockResolvedValueOnce(null); // parent missing

        await expect(
            moveFolderService(CLERK_ID, FOLDER_ID, { parentId: PARENT_ID })
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(mockedMove).not.toHaveBeenCalled();
    });

    it("rejects a missing folder with NotFoundError", async () => {
        mockedFindFolder.mockResolvedValue(null);

        await expect(
            moveFolderService(CLERK_ID, FOLDER_ID, { parentId: PARENT_ID })
        ).rejects.toBeInstanceOf(NotFoundError);
    });
});

describe("deleteFolderService", () => {
    it("collects the subtree and soft-deletes every id", async () => {
        const ids = [FOLDER_ID, "child-1", "child-2"];
        mockedFindFolder.mockResolvedValue(makeFolder());
        mockedCollectSubtree.mockResolvedValue(ids);
        mockedSoftDelete.mockResolvedValue(undefined);

        const result = await deleteFolderService(CLERK_ID, FOLDER_ID);

        expect(result).toEqual({ id: FOLDER_ID, deleted: true });
        expect(mockedCollectSubtree).toHaveBeenCalledWith(OWNER_ID, FOLDER_ID);
        expect(mockedSoftDelete).toHaveBeenCalledWith(ids);
    });

    it("rejects a missing folder with NotFoundError", async () => {
        mockedFindFolder.mockResolvedValue(null);

        await expect(
            deleteFolderService(CLERK_ID, FOLDER_ID)
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(mockedSoftDelete).not.toHaveBeenCalled();
    });
});

describe("folderPathService", () => {
    it("returns the ancestor trail (root -> self) as crumbs", async () => {
        mockedFindFolder.mockResolvedValue(makeFolder());
        mockedCollectAncestors.mockResolvedValue([
            makeFolder({ id: "root-id", name: "Root" }),
            makeFolder({ id: "mid-id", name: "Mid" }),
            makeFolder({ id: FOLDER_ID, name: "Leaf" }),
        ]);

        const result = await folderPathService(CLERK_ID, FOLDER_ID);

        expect(result).toEqual([
            { id: "root-id", name: "Root" },
            { id: "mid-id", name: "Mid" },
            { id: FOLDER_ID, name: "Leaf" },
        ]);
        expect(mockedCollectAncestors).toHaveBeenCalledWith(OWNER_ID, FOLDER_ID);
    });

    it("rejects a missing folder with NotFoundError", async () => {
        mockedFindFolder.mockResolvedValue(null);

        await expect(
            folderPathService(CLERK_ID, FOLDER_ID)
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(mockedCollectAncestors).not.toHaveBeenCalled();
    });
});
