// Central error handler. Translates thrown errors into the target API error
// envelope: { error: { code, message, details?, requestId } }.
// - AppError      -> its code/httpStatus/details
// - ZodError      -> VALIDATION 400 with field details
// - body-parser   -> VALIDATION 400 (malformed JSON)
// - anything else -> INTERNAL 500 (message hidden outside development)
// Stack traces are never sent to clients; they are logged server-side only.

import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { env } from "../shared/config/env";
import { logger } from "../shared/utils/logger";
import {
    AppError,
    InternalError,
    ValidationError,
    isAppError,
} from "../shared/errors/AppError";
import type { ApiErrorDetail, ApiErrorResponse } from "../shared/types/api-envelope";

const isDevelopment = env.NODE_ENV === "development";

const zodToDetails = (error: ZodError): ApiErrorDetail[] =>
    error.issues.map((issue) => ({
        path: issue.path.join(".") || "value",
        issue: issue.code,
    }));

const isBodyParserSyntaxError = (error: unknown): boolean =>
    error instanceof SyntaxError &&
    "body" in error &&
    (error as { status?: number }).status === 400;

const normalize = (error: unknown): AppError => {
    if (isAppError(error)) return error;
    if (error instanceof ZodError) return new ValidationError(zodToDetails(error));
    if (isBodyParserSyntaxError(error)) {
        return new ValidationError(undefined, "Invalid JSON payload.");
    }
    return new InternalError();
};

export const errorHandler = (
    error: unknown,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    // If a response is already streaming, defer to Express's default handling.
    if (res.headersSent) {
        return next(error);
    }

    const appError = normalize(error);
    const log = req.log ?? logger;

    // Log full error server-side (stack included) for unexpected failures.
    if (appError.expected) {
        log.warn(
            { code: appError.code, status: appError.httpStatus },
            appError.message
        );
    } else {
        log.error(
            { code: appError.code, status: appError.httpStatus, err: error },
            "unhandled error"
        );
    }

    // Hide internal details for 5xx outside development.
    const exposeMessage = appError.expected || isDevelopment;

    const body: ApiErrorResponse = {
        error: {
            code: appError.code,
            message: exposeMessage ? appError.message : "Internal server error.",
            ...(appError.details?.length ? { details: appError.details } : {}),
            requestId: req.requestId,
        },
    };

    res.status(appError.httpStatus).json(body);
};
