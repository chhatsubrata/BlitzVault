import express from "express";
import { validateRequest } from "../middleware/validateRequest";
import { completeGoogleSignIn, signInWithPasswordController, signOut, signUp, startGoogleSignIn, syncAuthenticatedUser } from "../controllers/auth/auth.controller";
import { authGoogleCallbackSchema, authGoogleStartSchema, authPasswordSignInSchema, authSignUpSchema } from "../validators/auth.schema";
import { requireAuth } from "../middleware/requireAuth";

const router = express.Router();

router.post("/signup", validateRequest(authSignUpSchema), signUp);
router.post("/signin/password", validateRequest(authPasswordSignInSchema), signInWithPasswordController);
router.post("/sync", requireAuth, syncAuthenticatedUser);
// Deprecated: frontend should use Clerk's OAuth flow and then call /sync with a bearer token.
router.post("/signin/google/start", validateRequest(authGoogleStartSchema), startGoogleSignIn);
// Deprecated: frontend should use Clerk's OAuth flow and then call /sync with a bearer token.
router.post("/signin/google/callback", validateRequest(authGoogleCallbackSchema), completeGoogleSignIn);
router.post("/signout", requireAuth, signOut);

export default router;
