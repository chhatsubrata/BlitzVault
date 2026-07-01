import { NextFunction, Request, Response } from "express";

import { UnauthenticatedError, ValidationError } from "../../shared/errors/AppError";
import {
    fileDownloadQuerySchema,
    fileIdParamSchema,
    fileListInFolderSchema,
    fileRestoreSchema,
    fileTrashListSchema,
    fileUploadCompleteSchema,
    fileUploadInitSchema,
} from "./files.schema";
import {
    completeUploadService,
    deleteFileService,
    downloadFileService,
    initUploadService,
    listFilesInFolderService,
    listTrashService,
    restoreFilesService,
} from "./files.service";

const IDEMPOTENCY_HEADER = "idempotency-key";
const IDEMPOTENCY_KEY_MAX_LENGTH = 255;

const requireIdempotencyKey = (req: Request): string => {
    const raw = req.header(IDEMPOTENCY_HEADER)?.trim();
    if (!raw) {
        throw new ValidationError(undefined, "Idempotency-Key header is required.");
    }
    if (raw.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
        throw new ValidationError(undefined, "Idempotency-Key header is too long.");
    }
    return raw;
};

// POST /api/v1/files/upload/init — reserve a file + return a presigned target.
export const initUpload = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const clerkUserId = req.auth?.clerkUserId;
        if (!clerkUserId) {
            throw new UnauthenticatedError("Authentication required.");
        }

        const idempotencyKey = requireIdempotencyKey(req);
        const input = fileUploadInitSchema.parse(
            res.locals.validatedRequest?.body ?? req.body
        );

        const data = await initUploadService(clerkUserId, idempotencyKey, input);

        return res.status(201).json({ data });
    } catch (error) {
        return next(error);
    }
};

// POST /api/v1/files/upload/complete — verify storage + flip the row to ready.
export const completeUpload = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const clerkUserId = req.auth?.clerkUserId;
        if (!clerkUserId) {
            throw new UnauthenticatedError("Authentication required.");
        }

        const input = fileUploadCompleteSchema.parse(
            res.locals.validatedRequest?.body ?? req.body
        );

        const file = await completeUploadService(clerkUserId, input);

        return res.status(200).json({ data: { file } });
    } catch (error) {
        return next(error);
    }
};

// GET /api/v1/files/:id/download — presigned, time-limited download URL.
export const downloadFile = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const clerkUserId = req.auth?.clerkUserId;
        if (!clerkUserId) {
            throw new UnauthenticatedError("Authentication required.");
        }

        const { id } = fileIdParamSchema.parse(
            res.locals.validatedRequest?.params ?? req.params
        );
        const { expiresInSeconds } = fileDownloadQuerySchema.parse(
            res.locals.validatedRequest?.query ?? req.query
        );

        const data = await downloadFileService(clerkUserId, id, expiresInSeconds);

        return res.status(200).json({ data });
    } catch (error) {
        return next(error);
    }
};

// DELETE /api/v1/files/:id — soft-delete (keeps the object for restore).
export const deleteFile = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const clerkUserId = req.auth?.clerkUserId;
        if (!clerkUserId) {
            throw new UnauthenticatedError("Authentication required.");
        }

        const { id } = fileIdParamSchema.parse(
            res.locals.validatedRequest?.params ?? req.params
        );

        const data = await deleteFileService(clerkUserId, id);

        return res.status(200).json({ data });
    } catch (error) {
        return next(error);
    }
};

// POST /api/v1/files/restore — restore soft-deleted files (single or bulk).
export const restoreFiles = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const clerkUserId = req.auth?.clerkUserId;
        if (!clerkUserId) {
            throw new UnauthenticatedError("Authentication required.");
        }

        const input = fileRestoreSchema.parse(
            res.locals.validatedRequest?.body ?? req.body
        );

        const data = await restoreFilesService(clerkUserId, input);

        return res.status(200).json({ data });
    } catch (error) {
        return next(error);
    }
};

// GET /api/v1/files?folderId=… — cursor-paginated files within a folder.
export const listFilesInFolder = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const clerkUserId = req.auth?.clerkUserId;
        if (!clerkUserId) {
            throw new UnauthenticatedError("Authentication required.");
        }

        const query = fileListInFolderSchema.parse(
            res.locals.validatedRequest?.query ?? req.query
        );

        const data = await listFilesInFolderService(clerkUserId, query);

        return res.status(200).json({ data });
    } catch (error) {
        return next(error);
    }
};

// GET /api/v1/files/trash — cursor-paginated soft-deleted files (all folders).
export const listTrash = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const clerkUserId = req.auth?.clerkUserId;
        if (!clerkUserId) {
            throw new UnauthenticatedError("Authentication required.");
        }

        const query = fileTrashListSchema.parse(
            res.locals.validatedRequest?.query ?? req.query
        );

        const data = await listTrashService(clerkUserId, query);

        return res.status(200).json({ data });
    } catch (error) {
        return next(error);
    }
};
