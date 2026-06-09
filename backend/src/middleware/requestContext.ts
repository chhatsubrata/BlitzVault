// Mint or echo a correlation id for every request, expose it on the response
// header (X-Request-Id), and attach a child logger bound with { reqId }.
// Must run first so all downstream logs/errors carry the same id.

import { randomUUID } from "crypto";
import { NextFunction, Request, Response } from "express";
import { logger } from "../shared/utils/logger";

const REQUEST_ID_HEADER = "X-Request-Id";

// Accept a client-supplied id only if it looks sane; otherwise mint our own.
const sanitizeIncomingId = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 128) return null;
    return /^[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : null;
};

export const requestContext = (req: Request, res: Response, next: NextFunction) => {
    const incoming = sanitizeIncomingId(req.headers["x-request-id"]);
    const requestId = incoming ?? `req_${randomUUID()}`;

    req.requestId = requestId;
    req.log = logger.child({ reqId: requestId });
    res.setHeader(REQUEST_ID_HEADER, requestId);

    next();
};
