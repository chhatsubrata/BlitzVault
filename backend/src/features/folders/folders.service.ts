import AppDataSource from "../../config/db";
import { Users } from "../../entities/Users";
import { FolderListQuery } from "./folders.schema";
import { findFoldersPage, FolderCursor } from "./folders.repository";
import { FolderResponse, toFolderResponse } from "./folders.mapper";

const userRepository = AppDataSource.getRepository(Users);

export type DriveListResult = {
    folders: FolderResponse[];
    // Files arrive once the upload pipeline lands (Week 2). Empty for now.
    files: never[];
    nextCursor: string | null;
};

const encodeCursor = (cursor: FolderCursor): string =>
    Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");

const decodeCursor = (raw?: string): FolderCursor | undefined => {
    if (!raw) return undefined;
    try {
        const parsed = JSON.parse(
            Buffer.from(raw, "base64url").toString("utf8")
        ) as Partial<FolderCursor>;
        if (typeof parsed.createdAt === "string" && typeof parsed.id === "string") {
            return { createdAt: parsed.createdAt, id: parsed.id };
        }
    } catch {
        // Malformed cursor -> treat as no cursor (first page).
    }
    return undefined;
};

/**
 * Lists the authenticated user's folders under a parent (root if absent).
 * Owner-scoped via the local user resolved from the Clerk subject.
 */
export const listDriveService = async (
    clerkUserId: string,
    query: FolderListQuery
): Promise<DriveListResult> => {
    const user = await userRepository.findOne({
        where: { clerk_user_id: clerkUserId },
    });

    // User not synced yet -> empty drive rather than an error.
    if (!user) {
        return { folders: [], files: [], nextCursor: null };
    }

    const rows = await findFoldersPage({
        ownerId: user.id,
        parentId: query.parentId,
        limit: query.limit,
        cursor: decodeCursor(query.cursor),
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];

    return {
        folders: page.map(toFolderResponse),
        files: [],
        nextCursor:
            hasMore && last
                ? encodeCursor({ createdAt: last.created_at.toISOString(), id: last.id })
                : null,
    };
};
