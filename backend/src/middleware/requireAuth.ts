import { NextFunction, Request, Response } from "express";
import { UnauthenticatedError } from "../shared/errors/AppError";
import { verifySessionToken } from "../services/clerk.service";

const BEARER_PREFIX = "Bearer ";

const getTokenFromAuthorizationHeader = (authorizationHeader?: string) => {
    if (!authorizationHeader || !authorizationHeader.startsWith(BEARER_PREFIX)) {
        return null;
    }

    const token = authorizationHeader.slice(BEARER_PREFIX.length).trim();
    return token || null;
};

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const token = getTokenFromAuthorizationHeader(req.headers.authorization);

        if (!token) {
            throw new UnauthenticatedError("Provide a valid Bearer token.");
        }

        const payload = await verifySessionToken(token);
        const clerkUserId = typeof payload.sub === "string" ? payload.sub : null;
        const sessionId = typeof payload.sid === "string" ? payload.sid : undefined;

        if (!clerkUserId) {
            throw new UnauthenticatedError("Invalid session token subject.");
        }

        req.auth = {
            clerkUserId,
            sessionId,
            token,
        };

        return next();
    } catch (error) {
        // Token verification failures (expired/invalid) also surface as 401.
        if (error instanceof UnauthenticatedError) {
            return next(error);
        }
        return next(new UnauthenticatedError("Invalid or expired session token."));
    }
};
