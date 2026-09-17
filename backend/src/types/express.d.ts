// Augments Express's Request/Locals via the global Express namespace (Express 5 @types pattern).
// Properties here are picked up by export interface Request extends Express.Request.

import type { Logger } from "pino";

export interface ValidatedRequestSegments {
    body?: unknown;
    params?: unknown;
    query?: unknown;
}

/** Object kinds an :id route can address. Matches the OpenFGA type names. */
export type ResourceKind = "file" | "folder";

/**
 * Set by loadResource(): the row behind :id, reduced to what authorization
 * needs. Services still load the full row themselves.
 */
export interface LoadedResource {
    kind: ResourceKind;
    id: string;
    ownerId: string;
}

declare global {
    namespace Express {
        interface Request {
            auth?: {
                clerkUserId: string;
                sessionId?: string;
                token: string;
                // Internal users.id, resolved by loadResource(). This is the
                // subject in `user:<id>` tuples — never the Clerk id.
                userId?: string;
            };
            resource?: LoadedResource;
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
