// Selects the AuthorizationService per env. The ONLY file in this module that
// reads `env` (mirrors storage/factory.ts). Off → deny-by-default stub; on →
// live OpenFGA adapter (creds validated in its constructor).

import { env } from "../../config/env";
import { FgaAuthorizationService } from "./fga.adapter";
import { DisabledAuthorizationService } from "./noop.adapter";
import { AuthorizationService } from "./types";

export const createAuthorizationService = (): AuthorizationService => {
    if (!env.FGA_ENABLED) {
        return new DisabledAuthorizationService();
    }

    return new FgaAuthorizationService({
        apiUrl: env.FGA_API_URL ?? "",
        storeId: env.FGA_STORE_ID ?? "",
        modelId: env.FGA_MODEL_ID ?? "",
    });
};
