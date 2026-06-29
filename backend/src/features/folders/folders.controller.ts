import { Request, Response, NextFunction } from "express";
import { UnauthenticatedError } from "../../shared/errors/AppError";
import {
    folderCreateSchema,
    folderIdParamSchema,
    folderListSchema,
    folderMoveSchema,
    folderRenameSchema,
} from "./folders.schema";
import {
    createFolderService,
    deleteFolderService,
    folderPathService,
    listDriveService,
    moveFolderService,
    renameFolderService,
} from "./folders.service";

/** Pull the authenticated Clerk subject or fail with 401. */
const requireClerkUserId = (req: Request): string => {
    const clerkUserId = req.auth?.clerkUserId;
    if (!clerkUserId) {
        throw new UnauthenticatedError("Authentication required.");
    }
    return clerkUserId;
};

// GET /api/v1/folders — list the current user's folders under a parent.
export const listFolders = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const clerkUserId = req.auth?.clerkUserId;
        if (!clerkUserId) {
            throw new UnauthenticatedError("Authentication required.");
        }

        const query = folderListSchema.parse(
            res.locals.validatedRequest?.query ?? req.query
        );

        const data = await listDriveService(clerkUserId, query);

        // Target success envelope (new endpoints use { data } per api-guidelines).
        return res.status(200).json({ data });
    } catch (error) {
        return next(error);
    }
};

// POST /api/v1/folders — create a folder (root or under a parent).
export const createFolder = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const clerkUserId = requireClerkUserId(req);
        const input = folderCreateSchema.parse(
            res.locals.validatedRequest?.body ?? req.body
        );

        const folder = await createFolderService(clerkUserId, input);

        return res.status(201).json({ data: { folder } });
    } catch (error) {
        return next(error);
    }
};

// PATCH /api/v1/folders/:id — rename a folder.
export const renameFolder = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const clerkUserId = requireClerkUserId(req);
        const { id } = folderIdParamSchema.parse(
            res.locals.validatedRequest?.params ?? req.params
        );
        const input = folderRenameSchema.parse(
            res.locals.validatedRequest?.body ?? req.body
        );

        const folder = await renameFolderService(clerkUserId, id, input);

        return res.status(200).json({ data: { folder } });
    } catch (error) {
        return next(error);
    }
};

// PATCH /api/v1/folders/:id/move — reparent a folder (cycle-checked).
export const moveFolder = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const clerkUserId = requireClerkUserId(req);
        const { id } = folderIdParamSchema.parse(
            res.locals.validatedRequest?.params ?? req.params
        );
        const input = folderMoveSchema.parse(
            res.locals.validatedRequest?.body ?? req.body
        );

        const folder = await moveFolderService(clerkUserId, id, input);

        return res.status(200).json({ data: { folder } });
    } catch (error) {
        return next(error);
    }
};

// DELETE /api/v1/folders/:id — cascade soft-delete a folder + its subtree.
export const deleteFolder = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const clerkUserId = requireClerkUserId(req);
        const { id } = folderIdParamSchema.parse(
            res.locals.validatedRequest?.params ?? req.params
        );

        const result = await deleteFolderService(clerkUserId, id);

        return res.status(200).json({ data: result });
    } catch (error) {
        return next(error);
    }
};

// GET /api/v1/folders/:id/path — breadcrumb trail (root -> self).
export const getFolderPath = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const clerkUserId = requireClerkUserId(req);
        const { id } = folderIdParamSchema.parse(
            res.locals.validatedRequest?.params ?? req.params
        );

        const path = await folderPathService(clerkUserId, id);

        return res.status(200).json({ data: { path } });
    } catch (error) {
        return next(error);
    }
};
