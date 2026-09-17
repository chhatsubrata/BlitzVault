// Resource-level authorization for :id routes (docs/openfga-model.md → Middleware).
//
//   validateRequest(idParamSchema, "params")
//   → loadResource("file" | "folder")   attaches req.resource + req.auth.userId
//   → authorize("can_read" | ...)        OpenFGA check; 403 on deny or error
//   → controller
//
// loadResource answers "does it exist?" (404 if not); authorize answers "may
// this caller do that to it?" (403 if not). Existence is never hidden behind a
// 403 — every existing client and test relies on 404 for unknown ids.

import { NextFunction, Request, Response } from "express";
import { IsNull } from "typeorm";

import AppDataSource from "../../config/db";
import { Files } from "../../entities/Files";
import { Folders } from "../../entities/Folders";
import { Users } from "../../entities/Users";
import { env } from "../config/env";
import {
    ForbiddenError,
    NotFoundError,
    UnauthenticatedError,
} from "../errors/AppError";
import { getAuthorizationService } from "../services/authz";
import { logger } from "../utils/logger";
import type { LoadedResource, ResourceKind } from "../../types/express";

/** Relations a route may demand. Names match the model verbatim. */
export type Relation = "can_read" | "can_write" | "can_share" | "can_delete";

const NOT_FOUND_MESSAGE: Record<ResourceKind, string> = {
    file: "File not found.",
    folder: "Folder not found.",
};

const idFromRequest = (req: Request, res: Response): string | undefined => {
    const params = res.locals.validatedRequest?.params ?? req.params;
    const id = (params as { id?: unknown } | undefined)?.id;
    return typeof id === "string" && id.length > 0 ? id : undefined;
};

/** Local users.id for a Clerk subject, or null when the user never synced. */
const resolveUserId = async (clerkUserId: string): Promise<string | null> => {
    const user = await AppDataSource.getRepository(Users).findOne({
        where: { clerk_user_id: clerkUserId },
        select: { id: true },
    });
    return user?.id ?? null;
};

/** Minimal id-only lookup — NOT owner-scoped. Ownership is authorize()'s job. */
const findResource = async (
    kind: ResourceKind,
    id: string
): Promise<LoadedResource | null> => {
    const where = { id, deleted_at: IsNull() };
    const select = { id: true, owner_id: true };

    const row =
        kind === "file"
            ? await AppDataSource.getRepository(Files).findOne({ where, select })
            : await AppDataSource.getRepository(Folders).findOne({ where, select });

    return row ? { kind, id: row.id, ownerId: row.owner_id } : null;
};

/**
 * Load the resource behind `:id` onto `req.resource`, and the caller's internal
 * user id onto `req.auth.userId`. Must run after requireAuth + validateRequest.
 */
export const loadResource = (kind: ResourceKind) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const auth = req.auth;
            if (!auth) {
                throw new UnauthenticatedError("Authentication required.");
            }
            const { clerkUserId } = auth;

            const id = idFromRequest(req, res);
            if (!id) {
                // validateRequest guarantees this; reaching here is a wiring bug.
                throw new NotFoundError(NOT_FOUND_MESSAGE[kind]);
            }

            const userId = await resolveUserId(clerkUserId);
            if (!userId) {
                // Valid JWT but no local user row yet — client must sync first.
                throw new UnauthenticatedError(
                    "User is not provisioned. Sync your account first."
                );
            }

            const resource = await findResource(kind, id);
            if (!resource) {
                throw new NotFoundError(NOT_FOUND_MESSAGE[kind]);
            }

            req.auth = { ...auth, userId };
            req.resource = resource;
            return next();
        } catch (error) {
            return next(error);
        }
    };
};

/**
 * Gate the request on `relation` for the loaded resource. Deny-by-default:
 * missing context, a false check, or ANY error from the authorization engine
 * all end in 403 — never 500/502, and never a silent allow.
 */
export const authorize = (relation: Relation) => {
    return async (req: Request, _res: Response, next: NextFunction) => {
        const resource = req.resource;
        const userId = req.auth?.userId;

        // A misordered chain (authorize before loadResource) fails closed.
        if (!resource || !userId) {
            return next(new ForbiddenError());
        }

        let allowed = false;

        if (!env.FGA_ENABLED) {
            // TRANSITIONAL — Week 3. With no OpenFGA (CI, tests, dev without the
            // server) fall back to the Phase 1 rule: owners only. This is the one
            // hardcoded ownership check in the codebase; it goes when OpenFGA runs
            // in CI (Week 3 Fri, Dev3) and the stub's deny-by-default takes over.
            allowed = resource.ownerId === userId;
        } else {
            try {
                allowed = await getAuthorizationService().check({
                    user: `user:${userId}`,
                    relation,
                    object: `${resource.kind}:${resource.id}`,
                });
            } catch (error) {
                // Engine unreachable / misconfigured → deny, don't 502. The
                // UpstreamError detail is logged, not returned.
                (req.log ?? logger).warn(
                    { err: error, relation, object: `${resource.kind}:${resource.id}` },
                    "authorization check failed; denying"
                );
                allowed = false;
            }
        }

        if (!allowed) {
            return next(new ForbiddenError());
        }
        return next();
    };
};
