import { NextFunction, Request, Response } from "express";

import { ForbiddenError, UnauthenticatedError } from "../../shared/errors/AppError";
import { linkTokenParamSchema } from "./links.schema";
import {
    createPublicLink,
    resolvePublicLink,
    revokePublicLink,
} from "./links.service";
import { listShares, type ShareResource } from "./sharing.service";

/**
 * Public-link handlers.
 *
 * Create/revoke are mounted on the file and folder routers behind
 * `loadResource` + `authorize("can_share")`, and answer with the same
 * `{ data: { shared } }` envelope as the grant endpoints — one response shape
 * for the whole share dialog, so the client invalidates one query.
 *
 * Resolve is mounted on its own anonymous router: it is the one endpoint in the
 * app with no caller.
 */
const requireResource = (req: Request): ShareResource => {
    const resource = req.resource;
    if (!resource) {
        // Only reachable if a route forgets loadResource — fail closed.
        throw new ForbiddenError();
    }
    return { kind: resource.kind, id: resource.id, ownerId: resource.ownerId };
};

// POST /api/v1/{files|folders}/:id/shares/link — mint (or return) the link.
export const createShareLink = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const resource = requireResource(req);
        const userId = req.auth?.userId;
        if (!userId) {
            throw new UnauthenticatedError("Authentication required.");
        }

        const { created } = await createPublicLink(resource, userId);
        const shared = await listShares(resource);

        // 201 only when something was actually minted; a repeat click gets 200
        // and the same token (createPublicLink is idempotent).
        return res.status(created ? 201 : 200).json({ data: { shared } });
    } catch (error) {
        return next(error);
    }
};

// DELETE /api/v1/{files|folders}/:id/shares/link — revoke the link.
export const revokeShareLink = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const resource = requireResource(req);

        await revokePublicLink(resource);
        const shared = await listShares(resource);

        return res.status(200).json({ data: { shared } });
    } catch (error) {
        return next(error);
    }
};

// GET /api/v1/links/:token — resolve a public link. UNAUTHENTICATED.
export const getPublicLink = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { token } = linkTokenParamSchema.parse(
            res.locals.validatedRequest?.params ?? req.params
        );

        const link = await resolvePublicLink(token);

        return res.status(200).json({ data: { link } });
    } catch (error) {
        return next(error);
    }
};
