import express from "express";
import { requireAuth } from "../../middleware/requireAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { authorize, loadResource } from "../../shared/middleware/authorize";
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
    getFolderPath,
    listFolders,
    moveFolder,
    renameFolder,
} from "./folders.controller";

const router = express.Router();

// All folder routes require a valid Clerk bearer token.
router.use(requireAuth);

// List folders under a parent (root if no parentId). Cursor pagination.
router.get("/", validateRequest(folderListSchema, "query"), listFolders);

// Breadcrumb trail (root -> self) for a folder. Read tier.
router.get(
    "/:id/path",
    validateRequest(folderIdParamSchema, "params"),
    loadResource("folder"),
    authorize("can_read"),
    getFolderPath
);

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
    loadResource("folder"),
    authorize("can_write"),
    renameFolder
);

// Move (reparent) a folder; rejects cycles.
// Authorizes the MOVED folder. The destination parent is still owner-checked
// in the service (Week 3 Wed: second can_write check on the destination).
router.patch(
    "/:id/move",
    rateLimit("write"),
    validateRequest(folderIdParamSchema, "params"),
    validateRequest(folderMoveSchema, "body"),
    loadResource("folder"),
    authorize("can_write"),
    moveFolder
);

// Cascade soft-delete a folder + its subtree.
router.delete(
    "/:id",
    rateLimit("write"),
    validateRequest(folderIdParamSchema, "params"),
    loadResource("folder"),
    authorize("can_delete"),
    deleteFolder
);

export default router;
