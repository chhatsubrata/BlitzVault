/**
 * "May this caller read this resource?" for endpoints that have no `:id` param.
 *
 * `loadResource` + `authorize()` cover every `/:id` route, but the list
 * endpoints address a folder through a QUERY parameter
 * (`GET /folders?parentId=`, `GET /files?folderId=`), so the middleware chain
 * has nothing to load and the check has to happen in the service.
 *
 * Deny-by-default, and identical in spirit to `authorize()`: an engine error is
 * a denial, never a 500. When OpenFGA is off this returns false rather than
 * true — callers reach it only after an ownership check has already failed, so
 * false preserves exactly the Phase 1 behaviour (owners only).
 */
import { env } from "../../config/env";
import { logger } from "../../utils/logger";
import { userRef } from "./outbox-writer";
import type { AuthorizationService } from "./types";

/**
 * Takes the service rather than reaching for the factory, matching how the rest
 * of this module is wired (see `drainOutbox`): the callers already hold one for
 * their per-item permission resolve, and an injected dependency is what makes
 * this path reachable from a test.
 */
export const canReadResource = async (
    authz: AuthorizationService,
    userId: string,
    object: string
): Promise<boolean> => {
    if (!env.FGA_ENABLED) return false;

    try {
        return await authz.check({
            user: userRef(userId),
            relation: "can_read",
            object,
        });
    } catch (error) {
        logger.warn({ err: error, object }, "read check failed; denying");
        return false;
    }
};
