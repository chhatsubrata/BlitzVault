import express from "express";
import { requireAuth } from "../../middleware/requireAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { rateLimit } from "../../shared/middleware/rate-limit";
import {
    folderCreateSchema,
    folderIdParamSchema,
    folderListSchema,
    folderMoveSchema,
    folderRenameSchema,
} from "./folders.schema";
import {
    createFolder,
    deleteFolder,
    listFolders,
    moveFolder,
    renameFolder,
} from "./folders.controller";

const router = express.Router();

// All folder routes require a valid Clerk bearer token.
router.use(requireAuth);

// List folders under a parent (root if no parentId). Cursor pagination.
router.get("/", validateRequest(folderListSchema, "query"), listFolders);

// Create a folder. Mutating -> `write` tier.
router.post(
    "/",
    rateLimit("write"),
    validateRequest(folderCreateSchema, "body"),
    createFolder
);

// Rename a folder.
router.patch(
    "/:id",
    rateLimit("write"),
    validateRequest(folderIdParamSchema, "params"),
    validateRequest(folderRenameSchema, "body"),
    renameFolder
);

// Move (reparent) a folder; rejects cycles.
router.patch(
    "/:id/move",
    rateLimit("write"),
    validateRequest(folderIdParamSchema, "params"),
    validateRequest(folderMoveSchema, "body"),
    moveFolder
);

// Cascade soft-delete a folder + its subtree.
router.delete(
    "/:id",
    rateLimit("write"),
    validateRequest(folderIdParamSchema, "params"),
    deleteFolder
);

export default router;
