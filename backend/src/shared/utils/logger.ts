// Root Pino logger. Structured JSON in non-dev; pretty in development.
// Hard rule (backend/CLAUDE.md): never log JWTs, passwords, presigned URLs.

import { pino } from "pino";
import { env } from "../config/env";

const isDevelopment = env.NODE_ENV === "development";

export const logger = pino({
    level: env.NODE_ENV === "test" ? "silent" : isDevelopment ? "debug" : "info",
    base: { service: "backend" },
    // Redact sensitive fields anywhere they appear in log objects.
    redact: {
        paths: [
            "req.headers.authorization",
            "headers.authorization",
            "authorization",
            "token",
            "password",
            "*.password",
            "*.token",
        ],
        censor: "[redacted]",
    },
    ...(isDevelopment
        ? {
              transport: {
                  target: "pino-pretty",
                  options: { colorize: true, translateTime: "SYS:standard" },
              },
          }
        : {}),
});

export type Logger = typeof logger;
