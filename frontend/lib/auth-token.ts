/**
 * Auth-token registry. Clerk's getToken() needs React context, but the fetcher
 * is a plain module — so we register a getter once (in AuthSync) and the fetcher
 * pulls the token automatically. Callers no longer thread `token` through every
 * API function. An explicit `token` passed to fetcher still wins (SSR/tests).
 */
type TokenGetter = () => Promise<string | null>;

let tokenGetter: TokenGetter = async () => null;

export const setTokenGetter = (getter: TokenGetter): void => {
  tokenGetter = getter;
};

export const getAuthToken = (): Promise<string | null> => tokenGetter();
