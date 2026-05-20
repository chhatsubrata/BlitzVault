import { ClerkServiceError, createGoogleSignInUrl, createSessionToken, getClerkUserById, revokeSessionById, signInWithPassword, signUpWithPassword, verifySessionToken } from "../../services/clerk.service";
import { upsertUserFromClerkService } from "../users/users.services";

const DEFAULT_USERNAME_FALLBACK = "user";
const STATE_TTL_MS = 10 * 60 * 1000;

// Temporary in-memory store for Google OAuth state validation (anti-CSRF).
const oauthStateStore = new Map<string, number>();

const cleanupExpiredStates = () => {
    const now = Date.now();
    for (const [state, expiresAt] of oauthStateStore.entries()) {
        if (expiresAt <= now) {
            oauthStateStore.delete(state);
        }
    }
};

export const registerGoogleState = (state: string) => {
    // Save state with expiry before redirecting to Google via Clerk.
    cleanupExpiredStates();
    oauthStateStore.set(state, Date.now() + STATE_TTL_MS);
};

export const consumeGoogleState = (state: string) => {
    // State is one-time use: read, validate, and remove.
    cleanupExpiredStates();
    const expiresAt = oauthStateStore.get(state);
    if (!expiresAt) {
        return false;
    }

    oauthStateStore.delete(state);
    return expiresAt > Date.now();
};

const extractPrimaryEmail = (clerkUser: Awaited<ReturnType<typeof getClerkUserById>>) => {
    // Prefer Clerk primary email; fallback to first available email.
    const primaryEmailId = clerkUser.primaryEmailAddressId;
    const primaryEmail = clerkUser.emailAddresses.find((emailAddress) => emailAddress.id === primaryEmailId);
    return primaryEmail?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress ?? "";
};

const buildAppUsername = (rawUsername?: string | null, email?: string) => {
    // Ensure local DB always gets a usable username string.
    if (rawUsername) {
        return rawUsername;
    }

    if (email) {
        return email.split("@")[0] || DEFAULT_USERNAME_FALLBACK;
    }

    return DEFAULT_USERNAME_FALLBACK;
};

export const syncUserFromClerk = async (clerkUserId: string) => {
    // Clerk is source of truth; local DB is a synced app profile mirror.
    const clerkUser = await getClerkUserById(clerkUserId);
    const email = extractPrimaryEmail(clerkUser);
    const username = buildAppUsername(clerkUser.username, email);
    const { user } = await upsertUserFromClerkService({
        clerk_user_id: clerkUser.id,
        email,
        username,
    });

    return { user };
};

export const signUpWithClerkService = async (email: string, username: string, password: string) => {
    // Create Clerk account, then create session and sync user into local DB.
    const createdClerkUser = await signUpWithPassword(email, username, password);
    const session = await signInWithPassword(email, password);
    const { user } = await syncUserFromClerk(createdClerkUser.id);
    const sessionToken = await createSessionToken(session.sessionId);

    return {
        user,
        sessionToken,
    };
};

export const signInWithPasswordService = async (identifier: string, password: string) => {
    // Validate credentials in Clerk, then sync/update local user profile.
    const { user: clerkUser, sessionId } = await signInWithPassword(identifier, password);
    const { user } = await syncUserFromClerk(clerkUser.id);
    const sessionToken = await createSessionToken(sessionId);

    return {
        user,
        sessionToken,
    };
};

export const startGoogleSignInService = async (state: string) => {
    // Register state before generating OAuth redirect URL.
    registerGoogleState(state);
    const { redirectUrl } = await createGoogleSignInUrl(state);
    return { redirectUrl };
};

export const completeGoogleSignInService = async (state: string, token: string) => {
    // Step 1: validate state to block replay/forged callback attempts.
    if (!consumeGoogleState(state)) {
        throw new ClerkServiceError("Invalid or expired Google OAuth state", 400);
    }

    // Step 2: verify Clerk session token and extract user/session ids.
    const payload = await verifySessionToken(token);
    const clerkUserId = typeof payload.sub === "string" ? payload.sub : null;
    const sessionId = typeof payload.sid === "string" ? payload.sid : null;

    if (!clerkUserId) {
        throw new ClerkServiceError("Invalid Google session token", 401);
    }

    // Step 3: sync profile in local DB and return a fresh bearer JWT.
    const { user } = await syncUserFromClerk(clerkUserId);
    const sessionToken = sessionId ? await createSessionToken(sessionId) : null;

    return {
        user,
        sessionToken,
    };
};

export const signOutService = async (sessionId?: string) => {
    // Sign out by revoking the active Clerk session id.
    if (!sessionId) {
        throw new ClerkServiceError("Session id not found in token", 400);
    }

    await revokeSessionById(sessionId);
};
