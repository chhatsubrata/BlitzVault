import express from "express";

import { validateRequest } from "../../middleware/validateRequest";
import { rateLimit } from "../../shared/middleware/rate-limit";
import { getPublicLink } from "./links.controller";
import { linkTokenParamSchema } from "./links.schema";

const router = express.Router();

// NO requireAuth — this is the public half of sharing, and the whole point is
// that it works without an account. Deliberately NOT mounted on the file or
// folder routers, both of which apply requireAuth to every route.
//
// `strict` tier (10/min): the only guess-resistant thing protecting the
// resource is the token, so brute-force attempts get throttled hard. Creating
// and revoking links are authenticated and live on the resource routers.
router.get(
    "/:token",
    rateLimit("strict"),
    validateRequest(linkTokenParamSchema, "params"),
    getPublicLink
);

export default router;
