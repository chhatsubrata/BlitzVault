import express from "express";
import { validateRequest } from "../middleware/validateRequest";
import { signInWithPasswordController, signOut, signUp, syncAuthenticatedUser } from "../controllers/auth/auth.controller";
import { authPasswordSignInSchema, authSignUpSchema } from "../validators/auth.schema";
import { requireAuth } from "../middleware/requireAuth";

const router = express.Router();

router.post("/signup", validateRequest(authSignUpSchema), signUp);
router.post("/signin/password", validateRequest(authPasswordSignInSchema), signInWithPasswordController);
router.post("/sync", requireAuth, syncAuthenticatedUser);
router.post("/signout", requireAuth, signOut);

export default router;
