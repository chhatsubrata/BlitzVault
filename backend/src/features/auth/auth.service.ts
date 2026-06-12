import { ClerkServiceError, createSessionToken, getClerkUserById, revokeSessionById, signInWithPassword, signUpWithPassword } from "../../shared/services/clerk.service";
import { upsertUserFromClerkService } from "../users/users.service";

const DEFAULT_USERNAME_FALLBACK = "user";

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

export const signOutService = async (sessionId?: string) => {
    // Sign out by revoking the active Clerk session id.
    if (!sessionId) {
        throw new ClerkServiceError("Session id not found in token", 400);
    }

    await revokeSessionById(sessionId);
};
