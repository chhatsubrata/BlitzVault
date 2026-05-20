// Augments Express's Request/Locals via the global Express namespace (Express 5 @types pattern).
// Properties here are picked up by export interface Request extends Express.Request.

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
        }

        interface Locals {
            validatedRequest?: ValidatedRequestSegments;
        }
    }
}

export {};
