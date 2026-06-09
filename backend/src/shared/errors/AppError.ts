// Typed application errors mapped to the target API error envelope.
// See docs/api-guidelines.md (error codes) and docs/backend-guidelines.md.
// The central errorHandler middleware translates these into the JSON envelope:
//   { error: { code, message, details?, requestId } }

import type { ApiErrorDetail } from "../types/api-envelope";

export type ErrorCode =
    | "UNAUTHENTICATED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "VALIDATION"
    | "CONFLICT"
    | "QUOTA_EXCEEDED"
    | "RATE_LIMITED"
    | "UPSTREAM"
    | "INTERNAL";

export class AppError extends Error {
    readonly code: ErrorCode;
    readonly httpStatus: number;
    readonly details?: ApiErrorDetail[];
    // 5xx are unexpected; we hide their message/details from clients in production.
    readonly expected: boolean;

    constructor(
        code: ErrorCode,
        httpStatus: number,
        message: string,
        details?: ApiErrorDetail[]
    ) {
        super(message);
        this.name = new.target.name;
        this.code = code;
        this.httpStatus = httpStatus;
        this.details = details;
        this.expected = httpStatus < 500;
        Error.captureStackTrace?.(this, new.target);
    }
}

export class ValidationError extends AppError {
    constructor(details?: ApiErrorDetail[], message = "Invalid input.") {
        super("VALIDATION", 400, message, details);
    }
}

export class UnauthenticatedError extends AppError {
    constructor(message = "Authentication required.") {
        super("UNAUTHENTICATED", 401, message);
    }
}

export class ForbiddenError extends AppError {
    constructor(message = "You do not have access to this resource.") {
        super("FORBIDDEN", 403, message);
    }
}

export class NotFoundError extends AppError {
    constructor(message = "Resource not found.") {
        super("NOT_FOUND", 404, message);
    }
}

export class ConflictError extends AppError {
    constructor(message = "Resource already exists.") {
        super("CONFLICT", 409, message);
    }
}

export class QuotaExceededError extends AppError {
    constructor(message = "Storage quota exceeded.") {
        super("QUOTA_EXCEEDED", 422, message);
    }
}

export class RateLimitedError extends AppError {
    constructor(message = "Too many requests.") {
        super("RATE_LIMITED", 429, message);
    }
}

export class UpstreamError extends AppError {
    constructor(message = "Upstream service unavailable.") {
        super("UPSTREAM", 502, message);
    }
}

export class InternalError extends AppError {
    constructor(message = "Internal server error.") {
        super("INTERNAL", 500, message);
    }
}

export const isAppError = (value: unknown): value is AppError =>
    value instanceof AppError;
