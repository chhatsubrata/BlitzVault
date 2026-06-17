import "reflect-metadata";
import express, { NextFunction, Request, Response } from "express";
import path from "path";
import swaggerUi from "swagger-ui-express";
import { env } from "./shared/config/env";
import { requestContext } from "./middleware/requestContext";
import { requestLogger } from "./middleware/requestLogger";
import { errorHandler } from "./middleware/errorHandler";
import { notFoundHandler } from "./middleware/notFoundHandler";
import healthRoutes from "./routes/healthRoutes";
import userRoutes from "./features/users/users.routes";
import authRoutes from "./features/auth/auth.routes";
import folderRoutes from "./features/folders/folders.routes";
import { openApiDocument } from "./shared/openapi/document";
import { rateLimit } from "./shared/middleware/rate-limit";

// Builds the fully-wired Express app WITHOUT starting the server or touching the
// database. server.ts owns process lifecycle (DB init + listen); tests import
// `app` directly into supertest. Keep middleware/route order identical here.
export const createApp = () => {
    const app = express();
    const allowedOrigins = new Set(env.CORS_ALLOWED_ORIGINS);

    // Trust the first proxy hop so req.ip (rate-limit key) reflects the client,
    // not the load balancer.
    app.set("trust proxy", 1);

    // Correlation id + per-request logger first, then request summary logging.
    app.use(requestContext);
    app.use(requestLogger);

    // CORS
    app.use((req: Request, res: Response, next: NextFunction) => {
        const requestOrigin = req.headers.origin;

        if (requestOrigin && allowedOrigins.has(requestOrigin)) {
            res.setHeader("Access-Control-Allow-Origin", requestOrigin);
            res.setHeader("Vary", "Origin");
        }

        res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-Id");
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");

        if (req.method === "OPTIONS") {
            return res.sendStatus(204);
        }

        return next();
    });
    app.use(express.json());
    app.use(express.static(path.join(__dirname, "..", "public")));

    // Health probes (public, unauthenticated)
    app.use(healthRoutes);

    // API docs (generated from Zod contracts). Gated off in prod via env.
    if (env.DOCS_ENABLED) {
        app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
    }

    // App-wide baseline limiter (generous; catches runaway clients). Mounted
    // after health probes so liveness/readiness checks aren't throttled.
    // Stricter per-route tiers (e.g. auth) layer on top.
    app.use("/api/v1", rateLimit("default"));

    // Routes
    app.use("/api/v1/auth", authRoutes);
    app.use("/api/v1/users", userRoutes);
    app.use("/api/v1/folders", folderRoutes);

    // Unmatched routes -> NotFoundError -> errorHandler
    app.use(notFoundHandler);

    // Central error handler (target error envelope)
    app.use(errorHandler);

    return app;
};

export const app = createApp();
