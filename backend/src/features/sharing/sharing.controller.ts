import { NextFunction, Request, Response } from "express";

import { ForbiddenError } from "../../shared/errors/AppError";
import { grantShare, listShares, revokeShare, type ShareResource } from "./sharing.service";
import { shareGrantCreateSchema, shareRevokeParamSchema } from "./sharing.schema";

/**
 * Share handlers, shared by the file and folder routers — the resource is
 * whatever `loadResource` put on the request, so one controller serves both.
 * Every route behind these handlers runs `authorize("can_share")`.
 */
const requireResource = (req: Request): ShareResource => {
    const resource = req.resource;
    if (!resource) {
        // Only reachable if a route forgets loadResource — fail closed.
        throw new ForbiddenError();
    }
    return { kind: resource.kind, id: resource.id, ownerId: resource.ownerId };
};

// GET /api/v1/{files|folders}/:id/shares — who the resource is shared with.
export const getShares = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const shared = await listShares(requireResource(req));
        return res.status(200).json({ data: { shared } });
    } catch (error) {
        return next(error);
    }
};

// POST /api/v1/{files|folders}/:id/shares — grant editor/viewer by email.
export const createShareGrant = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const input = shareGrantCreateSchema.parse(
            res.locals.validatedRequest?.body ?? req.body
        );

        const shared = await grantShare(requireResource(req), input);
        return res.status(201).json({ data: { shared } });
    } catch (error) {
        return next(error);
    }
};

// DELETE /api/v1/{files|folders}/:id/shares/:principalId — revoke a grant.
export const revokeShareGrant = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { principalId } = shareRevokeParamSchema.parse(
            res.locals.validatedRequest?.params ?? req.params
        );

        const shared = await revokeShare(requireResource(req), principalId);
        return res.status(200).json({ data: { shared } });
    } catch (error) {
        return next(error);
    }
};
