// Liveness & readiness probes. Public (no JWT) — see docs/api-guidelines.md.
// /healthz: process is up (liveness).
// /readyz : dependencies reachable, i.e. DB responds to SELECT 1 (readiness).
// Responses use the target success/error envelope.

import { Router, Request, Response } from "express";
import AppDataSource from "../config/db";
import type { ApiErrorResponse, ApiSuccessResponse } from "../shared/types/api-envelope";

const router = Router();

router.get("/healthz", (_req: Request, res: Response) => {
    const body: ApiSuccessResponse<{ status: "ok"; uptime: number }> = {
        data: { status: "ok", uptime: process.uptime() },
    };
    res.status(200).json(body);
});

router.get("/readyz", async (req: Request, res: Response) => {
    try {
        if (!AppDataSource.isInitialized) {
            throw new Error("DataSource not initialized");
        }
        await AppDataSource.query("SELECT 1");

        const body: ApiSuccessResponse<{ status: "ready" }> = {
            data: { status: "ready" },
        };
        res.status(200).json(body);
    } catch (error) {
        req.log?.warn({ err: error }, "readiness check failed");
        const body: ApiErrorResponse = {
            error: {
                code: "UPSTREAM",
                message: "Database not reachable.",
                requestId: req.requestId,
            },
        };
        res.status(503).json(body);
    }
});

export default router;
