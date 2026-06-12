import "reflect-metadata";
import express, { NextFunction, Request, Response } from "express";
import path from "path";
import AppDataSource from "./src/config/db";
import { env } from "./src/shared/config/env";
import { logger } from "./src/shared/utils/logger";
import { requestContext } from "./src/middleware/requestContext";
import { requestLogger } from "./src/middleware/requestLogger";
import { errorHandler } from "./src/middleware/errorHandler";
import { notFoundHandler } from "./src/middleware/notFoundHandler";
import healthRoutes from "./src/routes/healthRoutes";
import userRoutes from "./src/features/users/users.routes";
import authRoutes from "./src/features/auth/auth.routes";

const app = express();
const allowedOrigins = new Set(env.CORS_ALLOWED_ORIGINS);

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
app.use(express.static(path.join(__dirname, "public")));

// Health probes (public, unauthenticated)
app.use(healthRoutes);

// Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);

// Unmatched routes -> NotFoundError -> errorHandler
app.use(notFoundHandler);

// Central error handler (target error envelope)
app.use(errorHandler);

AppDataSource.initialize()
    .then(() => {
        logger.info("database connected");
    })
    .catch((error) => {
        logger.error({ err: error }, "database connection error");
        process.exit(1);
    });

app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "server started");
});
