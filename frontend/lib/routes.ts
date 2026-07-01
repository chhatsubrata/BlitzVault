// Central app route constants. Single source of truth for redirects so auth
// flows, OAuth callback, and middleware never drift on magic-string paths.

/** Where users land after a completed sign-in / sign-up. */
export const POST_AUTH_REDIRECT = "/drive";

/** Public sign-in route; unauthenticated users are sent here. */
export const SIGN_IN_ROUTE = "/signin";

/** Query param carrying the originally-requested path through the login flow. */
export const REDIRECT_PARAM = "redirect_url";

/**
 * Resolve where to send a user after auth. Only same-origin absolute paths are
 * allowed — anything else (external URL, protocol-relative, backslash tricks)
 * falls back to the default landing route, so a crafted `redirect_url` can't be
 * used for an open redirect.
 */
export const resolvePostAuthRedirect = (
  raw: string | null | undefined
): string => {
  if (!raw) return POST_AUTH_REDIRECT;
  const isSafeInternalPath =
    raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\");
  return isSafeInternalPath ? raw : POST_AUTH_REDIRECT;
};
