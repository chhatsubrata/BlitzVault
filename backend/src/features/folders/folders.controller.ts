import { Request, Response, NextFunction } from "express";
import { UnauthenticatedError } from "../../shared/errors/AppError";
import { folderListSchema } from "./folders.schema";
import { listDriveService } from "./folders.service";

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
