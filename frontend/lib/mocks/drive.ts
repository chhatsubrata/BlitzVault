import type { DriveList } from "@/features/drive/types";

/**
 * Static mock for the drive list — stands in until the backend GET /folders
 * endpoint ships. Shapes match the FE response types exactly.
 */
export const mockDriveList: DriveList = {
    folders: [
        {
            id: "f0000000-0000-4000-8000-000000000001",
            name: "Documents",
            parentId: null,
            createdAt: "2026-06-10T09:00:00.000Z",
            updatedAt: "2026-06-12T11:30:00.000Z",
        },
        {
            id: "f0000000-0000-4000-8000-000000000002",
            name: "Photos",
            parentId: null,
            createdAt: "2026-06-08T14:20:00.000Z",
            updatedAt: "2026-06-11T08:05:00.000Z",
        },
        {
            id: "f0000000-0000-4000-8000-000000000003",
            name: "Projects",
            parentId: null,
            createdAt: "2026-06-01T10:00:00.000Z",
            updatedAt: "2026-06-14T16:45:00.000Z",
        },
    ],
    files: [
        {
            id: "a0000000-0000-4000-8000-000000000001",
            name: "Q2-report.pdf",
            folderId: "f0000000-0000-4000-8000-000000000001",
            sizeBytes: "248320",
            mime: "application/pdf",
            status: "ready",
            createdAt: "2026-06-12T11:30:00.000Z",
            updatedAt: "2026-06-12T11:30:00.000Z",
        },
        {
            id: "a0000000-0000-4000-8000-000000000002",
            name: "logo.png",
            folderId: "f0000000-0000-4000-8000-000000000002",
            sizeBytes: "51200",
            mime: "image/png",
            status: "ready",
            createdAt: "2026-06-11T08:05:00.000Z",
            updatedAt: "2026-06-11T08:05:00.000Z",
        },
        {
            id: "a0000000-0000-4000-8000-000000000003",
            name: "notes.txt",
            folderId: "f0000000-0000-4000-8000-000000000003",
            sizeBytes: "1024",
            mime: "text/plain",
            status: "ready",
            createdAt: "2026-06-14T16:45:00.000Z",
            updatedAt: "2026-06-14T16:45:00.000Z",
        },
    ],
    nextCursor: null,
};

/** Toggle to this in the hook to preview the empty state. */
export const emptyDriveList: DriveList = {
    folders: [],
    files: [],
    nextCursor: null,
};
