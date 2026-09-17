// Selects the AuthorizationService per env. The ONLY file in this module that
// reads `env` (mirrors storage/factory.ts). Off → deny-by-default stub; on →
// live OpenFGA adapter (creds validated in its constructor).

import { env } from "../../config/env";
import { CachedAuthorizationService } from "./cache";
import { FgaAuthorizationService } from "./fga.adapter";
import { DisabledAuthorizationService } from "./noop.adapter";
import { AuthorizationService } from "./types";

export const createAuthorizationService = (): AuthorizationService => {
    if (!env.FGA_ENABLED) {
        // Never wrapped: caching a constant `false` buys nothing and would only
        // hide which implementation answered.
        return new DisabledAuthorizationService();
    }

    const live = new FgaAuthorizationService({
        apiUrl: env.FGA_API_URL ?? "",
        storeId: env.FGA_STORE_ID ?? "",
        modelId: env.FGA_MODEL_ID ?? "",
    });

    return env.FGA_CACHE_ENABLED ? new CachedAuthorizationService(live) : live;
};

let instance: AuthorizationService | undefined;

/**
 * Process-wide instance for request paths (middleware, services). Built on
 * first use, not at import, so env is validated exactly once and the disabled
 * stub's boot warning logs once — not per request. Scripts and tests that need
 * a fresh instance keep using createAuthorizationService().
 */
export const getAuthorizationService = (): AuthorizationService =>
    (instance ??= createAuthorizationService());
