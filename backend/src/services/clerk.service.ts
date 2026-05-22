import { createClerkClient, verifyToken } from "@clerk/backend";
import { isClerkAPIResponseError } from "@clerk/backend/errors";
import { env } from "../shared/config/env";

const GOOGLE_OAUTH_STRATEGY = "oauth_google";

export class ClerkServiceError extends Error {
    statusCode: number;

    constructor(message: string, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}

const clerkClient = createClerkClient({
    secretKey: env.CLERK_SECRET_KEY,
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
});

// Minimal shape we read from Clerk API errors after runtime guard.
type ClerkApiErrorShape = {
    status?: number;
    errors?: Array<{
        longMessage?: string;
        message?: string;
    }>;
};

const parseClerkError = (error: unknown): ClerkServiceError => {
    // Normalize Clerk SDK errors into a single internal error type for controllers.
    if (isClerkAPIResponseError(error)) {
        const clerkError = error as ClerkApiErrorShape;
        const firstError = clerkError.errors?.[0];
        return new ClerkServiceError(
            firstError?.longMessage ?? firstError?.message ?? "Clerk API request failed",
            clerkError.status ?? 400
        );
    }

    return new ClerkServiceError("Clerk integration failed", 500);
};

export const signUpWithPassword = async (email: string, username: string, password: string) => {
    try {
        // Creates the identity record in Clerk; local DB sync is handled elsewhere.
        const user = await clerkClient.users.createUser({
            emailAddress: [email],
            username,
            password,
        });

        return user;
    } catch (error) {
        throw parseClerkError(error);
    }
};

const findUserByIdentifier = async (identifier: string) => {
    const normalizedIdentifier = identifier.trim();
    // Clerk search filters differ for email vs username, so we branch explicitly.
    const isEmail = normalizedIdentifier.includes("@");

    const result = await clerkClient.users.getUserList(
        isEmail ? { emailAddress: [normalizedIdentifier], limit: 1 } : { username: [normalizedIdentifier], limit: 1 }
    );

    return result.data[0] ?? null;
};

export const signInWithPassword = async (identifier: string, password: string) => {
    try {
        // Resolve identity first, then ask Clerk to verify provided password.
        const user = await findUserByIdentifier(identifier);

        if (!user) {
            throw new ClerkServiceError("Invalid credentials", 401);
        }

        await clerkClient.users.verifyPassword({
            userId: user.id,
            password,
        });

        // Create a Clerk session after password verification succeeds.
        const session = await clerkClient.sessions.createSession({
            userId: user.id,
        });

        return { user, sessionId: session.id };
    } catch (error) {
        if (error instanceof ClerkServiceError) {
            throw error;
        }

        throw parseClerkError(error);
    }
};

export const createGoogleSignInUrl = async (state?: string) => {
    if (!env.CLERK_GOOGLE_REDIRECT_URL || !env.CLERK_GOOGLE_CALLBACK_URL) {
        throw new ClerkServiceError(
            "Google OAuth is not configured. Set CLERK_GOOGLE_REDIRECT_URL and CLERK_GOOGLE_CALLBACK_URL.",
            500
        );
    }

    // We call Clerk Frontend API endpoint to start OAuth and receive redirect URL.
    const response = await fetch(`${env.CLERK_JWT_ISSUER}/v1/client/sign_ins`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${env.CLERK_PUBLISHABLE_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            strategy: GOOGLE_OAUTH_STRATEGY,
            redirect_url: env.CLERK_GOOGLE_REDIRECT_URL,
            action_complete_redirect_url: env.CLERK_GOOGLE_CALLBACK_URL,
            ...(state ? { state } : {}),
        }),
    });

    const payload = (await response.json()) as {
        external_verification_redirect_url?: string;
        errors?: Array<{ long_message?: string; message?: string }>;
    };

    if (!response.ok || !payload.external_verification_redirect_url) {
        const errorMessage = payload.errors?.[0]?.long_message ?? payload.errors?.[0]?.message ?? "Unable to create Google sign-in URL";
        throw new ClerkServiceError(errorMessage, response.status || 400);
    }

    return {
        redirectUrl: payload.external_verification_redirect_url,
    };
};

export const verifySessionToken = async (token: string) => {
    // Audience is optional; include it only when configured for stricter JWT checks.
    const audience = env.CLERK_JWT_AUDIENCE ? [env.CLERK_JWT_AUDIENCE] : undefined;

    return verifyToken(token, {
        secretKey: env.CLERK_SECRET_KEY,
        audience,
    });
};

export const revokeSessionById = async (sessionId: string) => {
    try {
        // Revokes current Clerk session so the token cannot be reused.
        await clerkClient.sessions.revokeSession(sessionId);
    } catch (error) {
        throw parseClerkError(error);
    }
};

export const getClerkUserById = async (userId: string) => {
    try {
        return await clerkClient.users.getUser(userId);
    } catch (error) {
        throw parseClerkError(error);
    }
};

export const createSessionToken = async (sessionId: string) => {
    try {
        // Exchanges a session id for a bearer JWT expected by protected API routes.
        const token = await clerkClient.sessions.getToken(sessionId);
        return token.jwt;
    } catch (error) {
        throw parseClerkError(error);
    }
};
