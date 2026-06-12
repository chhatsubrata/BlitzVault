// Central app route constants. Single source of truth for redirects so auth
// flows, OAuth callback, and middleware never drift on magic-string paths.

/** Where users land after a completed sign-in / sign-up. */
export const POST_AUTH_REDIRECT = "/drive";

/** Public sign-in route; unauthenticated users are sent here. */
export const SIGN_IN_ROUTE = "/signin";
