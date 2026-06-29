/**
 * TanStack Query key factory for the drive feature.
 * Establishes the per-feature keys convention for the app.
 */
export const driveKeys = {
    all: ["drive"] as const,
    list: (parentId?: string) => ["drive", "list", parentId ?? "root"] as const,
    path: (folderId: string) => ["drive", "path", folderId] as const,
};
