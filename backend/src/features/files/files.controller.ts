import { NextFunction, Request, Response } from "express";

import { UnauthenticatedError, ValidationError } from "../../shared/errors/AppError";
import { fileUploadCompleteSchema, fileUploadInitSchema } from "./files.schema";
import { completeUploadService, initUploadService } from "./files.service";

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
