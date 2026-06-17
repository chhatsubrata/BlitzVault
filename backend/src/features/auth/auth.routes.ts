import express from "express";
import { validateRequest } from "../../middleware/validateRequest";
import { signInWithPasswordController, signOut, signUp, syncAuthenticatedUser } from "./auth.controller";
import { authPasswordSignInSchema, authSignUpSchema } from "./auth.schema";
import { requireAuth } from "../../middleware/requireAuth";
import { rateLimit } from "../../shared/middleware/rate-limit";

const router = express.Router();

// Auth endpoints are the abuse magnet (credential stuffing, sync floods) — the
// `strict` tier (10/min, see docs/rate-limiting.md) runs before validation/auth.
router.post("/signup", rateLimit("strict"), validateRequest(authSignUpSchema), signUp);
router.post("/signin/password", rateLimit("strict"), validateRequest(authPasswordSignInSchema), signInWithPasswordController);
router.post("/sync", rateLimit("strict"), requireAuth, syncAuthenticatedUser);
router.post("/signout", requireAuth, signOut);

export default router;
