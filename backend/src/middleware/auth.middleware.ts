import { NextFunction, Request, Response } from "express";
import { env } from "../shared/config/env";
import {
    internalServerErrorResponse,
    unauthorizedResponse,
} from "../utils/responses";

const BEARER_PREFIX = "Bearer ";

export const requireBearerAuth = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const authorizationHeader = req.headers.authorization;

    if (!authorizationHeader || !authorizationHeader.startsWith(BEARER_PREFIX)) {
        return unauthorizedResponse(
            res,
            "Unauthorized. Provide Authorization header as Bearer <token>."
        );
    }

    const token = authorizationHeader.slice(BEARER_PREFIX.length).trim();

    if (!token) {
        return unauthorizedResponse(res, "Unauthorized. Bearer token is missing.");
    }

    if (!env.AUTH_BEARER_TOKEN) {
        return internalServerErrorResponse(res, "Server auth is not configured.");
    }

    if (token !== env.AUTH_BEARER_TOKEN) {
        return unauthorizedResponse(res, "Unauthorized. Invalid bearer token.");
    }

    next();
};
