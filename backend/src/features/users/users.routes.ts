import express from "express";
import { createUser, deleteUser, getUser, getUserById, updateUser } from "./users.controller";
import { validateRequest } from "../../middleware/validateRequest";
import { requireAuth } from "../../middleware/requireAuth";
import {
    createUserSchema,
    listUsersQuerySchema,
    updateUserSchema,
} from "./users.schema";

const router = express.Router();

// All user routes require a valid Clerk bearer token.
router.use(requireAuth);

// Create a local user profile record (normally synced from Clerk auth flows).
router.post("/", validateRequest(createUserSchema), createUser);
// Get paginated users list.
router.get("/", validateRequest(listUsersQuerySchema, "query"), getUser);
// Get one user by id.
router.get("/:id", getUserById);
// Update user profile fields.
router.put("/:id", validateRequest(updateUserSchema), updateUser);
// Delete user profile by id.
router.delete("/:id", deleteUser);

export default router;