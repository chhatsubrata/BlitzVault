import 'reflect-metadata';
import express, { NextFunction, Request, Response } from "express";
import path from "path";
import AppDataSource from "./src/config/db";
import { config } from "./src/config/dotenv";
import userRoutes from "./src/routes/userRoutes";
import authRoutes from "./src/routes/authRoutes";
import { badRequestResponse, internalServerErrorResponse } from "./src/utils/responses";

const app = express();
const DEFAULT_FRONTEND_ORIGINS = ["http://localhost:3000", "http://localhost:3001"];

const parseCommaSeparatedOrigins = (value: string | undefined): string[] =>
    value
        ?.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean) ?? [];

const envOrigins = parseCommaSeparatedOrigins(process.env.CORS_ALLOWED_ORIGINS);
const allowedOrigins = new Set(envOrigins.length > 0 ? envOrigins : DEFAULT_FRONTEND_ORIGINS);

// middleware
app.use((req: Request, res: Response, next: NextFunction) => {
    const requestOrigin = req.headers.origin;

    if (requestOrigin && allowedOrigins.has(requestOrigin)) {
        res.setHeader("Access-Control-Allow-Origin", requestOrigin);
        res.setHeader("Vary", "Origin");
    }

    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    return next();
});
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);

// Global error handler for malformed JSON and other middleware errors.
app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
    const hasBodyParserSyntaxError =
        error instanceof SyntaxError &&
        "body" in error &&
        (error as { status?: number }).status === 400

    if (hasBodyParserSyntaxError) {
        return badRequestResponse(res, "Invalid JSON payload.");
    }

    console.error("Unhandled server error: ", error);
    return internalServerErrorResponse(res);
});

AppDataSource.initialize().then(() => {
    console.log("Database connected");
}).catch((error) => {
    console.log("Database connection error: ", error);
    process.exit(1);
});

app.listen(config.PORT, () => {
    console.log(`Server is running on port ${config.PORT}`);
});