import { Request, Response } from "express";
import { randomUUID } from "crypto";
import { badRequestResponse, createdResponse, internalServerErrorResponse, successResponse, unauthorizedResponse } from "../../utils/responses";
import { toPublicUser } from "../../utils/user.mapper";
import { ClerkServiceError } from "../../services/clerk.service";
import { completeGoogleSignInService, signInWithPasswordService, signOutService, signUpWithClerkService, startGoogleSignInService, syncUserFromClerk } from "./auth.services";

const AUTHORIZATION_HEADER = "Authorization";

// Creates a consistent token object for client responses.
const buildSessionBearerToken = (sessionToken: string) => ({
    tokenType: "bearer",
    token: sessionToken,
});

// Converts service errors into clear HTTP responses.
const handleAuthError = (res: Response, error: unknown) => {
    if (error instanceof ClerkServiceError) {
        if (error.statusCode === 401) {
            return unauthorizedResponse(res, error.message);
        }

        return badRequestResponse(res, error.message);
    }

    console.error("Auth controller error:", error);
    return internalServerErrorResponse(res);
};

export const signUp = async (req: Request, res: Response) => {
    try {
        // Signup flow: create Clerk account, sync local user, return bearer token.
        const { email, username, password } = req.body;
        const { user, sessionToken } = await signUpWithClerkService(email, username, password);

        return createdResponse(res, "Sign up successful", {
            user: toPublicUser(user),
            session: buildSessionBearerToken(sessionToken),
        });
    } catch (error) {
        return handleAuthError(res, error);
    }
};

export const signInWithPasswordController = async (req: Request, res: Response) => {
    try {
        // Password signin flow using email/username as identifier.
        const { identifier, password } = req.body;
        const { user, sessionToken } = await signInWithPasswordService(identifier, password);

        return successResponse(res, "Sign in successful", {
            user: toPublicUser(user),
            session: buildSessionBearerToken(sessionToken),
        });
    } catch (error) {
        return handleAuthError(res, error);
    }
};

export const syncAuthenticatedUser = async (req: Request, res: Response) => {
    try {
        const clerkUserId = req.auth?.clerkUserId;
        if (!clerkUserId) {
            return unauthorizedResponse(res, "Unauthorized. Invalid session token subject.");
        }

        const { user } = await syncUserFromClerk(clerkUserId);
        return successResponse(res, "User synced successfully", {
            user: toPublicUser(user),
        });
    } catch (error) {
        return handleAuthError(res, error);
    }
};

export const startGoogleSignIn = async (req: Request, res: Response) => {
    try {
        // Deprecated: Clerk frontend should own Google OAuth and token acquisition.
        // Start Google OAuth: generate/use state and return redirect URL.
        const providedState = typeof req.body?.state === "string" ? req.body.state : null;
        const generatedState = randomUUID();
        const state = providedState ?? generatedState;
        const { redirectUrl } = await startGoogleSignInService(state);

        return successResponse(res, "Google sign-in URL created", {
            redirectUrl,
            state,
        });
    } catch (error) {
        return handleAuthError(res, error);
    }
};

export const completeGoogleSignIn = async (req: Request, res: Response) => {
    try {
        // Deprecated: Clerk frontend should own Google OAuth and token acquisition.
        // Complete Google OAuth with callback state + token verification.
        const { state, token } = req.body;
        const { user, sessionToken } = await completeGoogleSignInService(state, token);
        const data: Record<string, unknown> = {
            user: toPublicUser(user),
        };

        if (sessionToken) {
            data.session = buildSessionBearerToken(sessionToken);
        }

        return successResponse(res, "Google sign-in successful", data);
    } catch (error) {
        return handleAuthError(res, error);
    }
};

export const signOut = async (req: Request, res: Response) => {
    try {
        // Signout flow: revoke current Clerk session.
        await signOutService(req.auth?.sessionId);
        res.removeHeader(AUTHORIZATION_HEADER);
        return successResponse(res, "Sign out successful");
    } catch (error) {
        return handleAuthError(res, error);
    }
};
