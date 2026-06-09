// Emit one structured summary line per request when the response finishes.
// Fields: reqId, method, route, statusCode, latencyMs, userId.
// Level by status: 5xx -> error, 4xx -> warn, else info.
// Relies on requestContext having set req.log; falls back to root logger.

import { NextFunction, Request, Response } from "express";
import { logger } from "../shared/utils/logger";

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
    const startNs = process.hrtime.bigint();

    res.on("finish", () => {
        const latencyMs = Number(process.hrtime.bigint() - startNs) / 1_000_000;
        const log = req.log ?? logger;

        // route is the matched mount path when available, else the raw path.
        const route = req.route?.path ?? req.originalUrl.split("?")[0];
        const statusCode = res.statusCode;

        const payload = {
            method: req.method,
            route,
            statusCode,
            latencyMs: Math.round(latencyMs * 100) / 100,
            userId: req.auth?.clerkUserId,
        };

        if (statusCode >= 500) {
            log.error(payload, "request failed");
        } else if (statusCode >= 400) {
            log.warn(payload, "request client error");
        } else {
            log.info(payload, "request completed");
        }
    });

    next();
};
