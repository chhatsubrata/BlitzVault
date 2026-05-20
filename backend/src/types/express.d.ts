// This declaration file augments Express's Request type so middleware can attach
// Clerk-authenticated user context (clerkUserId/sessionId/token) with type safety.
// Without this, accessing req.auth in controllers and routes causes TS errors.

import "express-serve-static-core";

declare module "express-serve-static-core" {
    interface ValidatedRequestSegments {
        body?: unknown;
        params?: unknown;
        query?: unknown;
    }

    interface Request {
        auth?: {
            clerkUserId: string;
            sessionId?: string;
            token: string;
        };
    }

    interface Locals {
        validatedRequest?: ValidatedRequestSegments;
    }
}

export {};
