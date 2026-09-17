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
    shareGrantCreateSchema,
    shareResourceIdParamSchema,
    shareRevokeParamSchema,
} from "../sharing/sharing.schema";
import { publicLinkCreateSchema } from "../sharing/links.schema";
import {
    createShareGrant,
    getShares,
    revokeShareGrant,
} from "../sharing/sharing.controller";
import { createShareLink, revokeShareLink } from "../sharing/links.controller";
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

// --- Sharing (grants live in OpenFGA; see features/sharing) -----------------
// Sharing a folder reaches its contents through the `parent` tuples, so these
// three routes are the whole subtree's access control. Gated on `can_share`.

router.get(
    "/:id/shares",
    validateRequest(shareResourceIdParamSchema, "params"),
    loadResource("folder"),
    authorize("can_share"),
    getShares
);

router.post(
    "/:id/shares",
    rateLimit("share"),
    validateRequest(shareResourceIdParamSchema, "params"),
    validateRequest(shareGrantCreateSchema, "body"),
    loadResource("folder"),
    authorize("can_share"),
    createShareGrant
);

// Public link. Declared BEFORE "/:id/shares/:principalId" — Express matches in
// declaration order, and "link" would otherwise be validated as a principal
// UUID and rejected with a 400. A folder link reaches the whole subtree through
// the same `parent` tuples as a user grant.
router.post(
    "/:id/shares/link",
    rateLimit("share"),
    validateRequest(shareResourceIdParamSchema, "params"),
    validateRequest(publicLinkCreateSchema, "body"),
    loadResource("folder"),
    authorize("can_share"),
    createShareLink
);

router.delete(
    "/:id/shares/link",
    rateLimit("share"),
    validateRequest(shareResourceIdParamSchema, "params"),
    loadResource("folder"),
    authorize("can_share"),
    revokeShareLink
);

router.delete(
    "/:id/shares/:principalId",
    rateLimit("share"),
    validateRequest(shareRevokeParamSchema, "params"),
    loadResource("folder"),
    authorize("can_share"),
    revokeShareGrant
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
