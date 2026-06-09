// Augments Express's Request/Locals via the global Express namespace (Express 5 @types pattern).
// Properties here are picked up by export interface Request extends Express.Request.

import type { Logger } from "pino";

export interface ValidatedRequestSegments {
    body?: unknown;
    params?: unknown;
    query?: unknown;
}

declare global {
    namespace Express {
        interface Request {
            auth?: {
                clerkUserId: string;
                sessionId?: string;
                token: string;
            };
            // Correlation id minted/echoed by requestContext middleware.
            requestId?: string;
            // Per-request child logger bound with { reqId }.
            log?: Logger;
        }

        interface Locals {
            validatedRequest?: ValidatedRequestSegments;
        }
    }
}

export {};
