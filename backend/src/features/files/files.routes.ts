import express from "express";

import { requireAuth } from "../../middleware/requireAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { authorize, loadResource } from "../../shared/middleware/authorize";
import { rateLimit } from "../../shared/middleware/rate-limit";
import {
    fileDownloadQuerySchema,
    fileIdParamSchema,
    fileListInFolderSchema,
    fileRestoreSchema,
    fileTrashListSchema,
    fileUploadCompleteSchema,
    fileUploadInitSchema,
} from "./files.schema";
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
    completeUpload,
    deleteFile,
    downloadFile,
    initUpload,
    listFilesInFolder,
    listTrash,
    restoreFiles,
} from "./files.controller";

const router = express.Router();

// All file routes require a valid Clerk bearer token.
router.use(requireAuth);

// List files within a folder (cursor pagination). Read tier.
router.get("/", validateRequest(fileListInFolderSchema, "query"), listFilesInFolder);

// List soft-deleted files (the trash). Literal path -> before "/:id/...". Read tier.
router.get("/trash", validateRequest(fileTrashListSchema, "query"), listTrash);

// Reserve a file + sign a direct-to-storage upload. Mutating -> `write` tier.
router.post(
    "/upload/init",
    rateLimit("write"),
    validateRequest(fileUploadInitSchema, "body"),
    initUpload
);

// Finalize an upload once the bytes are in storage.
router.post(
    "/upload/complete",
    rateLimit("write"),
    validateRequest(fileUploadCompleteSchema, "body"),
    completeUpload
);

// Restore soft-deleted files (single or bulk). Mutating -> `write` tier.
// Declared before "/:id" so the literal path wins over the param route.
router.post(
    "/restore",
    rateLimit("write"),
    validateRequest(fileRestoreSchema, "body"),
    restoreFiles
);

// Presigned, time-limited download URL. Read tier.
router.get(
    "/:id/download",
    validateRequest(fileIdParamSchema, "params"),
    validateRequest(fileDownloadQuerySchema, "query"),
    loadResource("file"),
    authorize("can_read"),
    downloadFile
);

// --- Sharing (grants live in OpenFGA; see features/sharing) -----------------
// All three gate on `can_share`: seeing who has access is itself a sharing-level
// view, so a plain viewer cannot enumerate the other people on a file.

router.get(
    "/:id/shares",
    validateRequest(shareResourceIdParamSchema, "params"),
    loadResource("file"),
    authorize("can_share"),
    getShares
);

router.post(
    "/:id/shares",
    rateLimit("share"),
    validateRequest(shareResourceIdParamSchema, "params"),
    validateRequest(shareGrantCreateSchema, "body"),
    loadResource("file"),
    authorize("can_share"),
    createShareGrant
);

// Public link. Declared BEFORE "/:id/shares/:principalId" — Express matches in
// declaration order, and "link" would otherwise be validated as a principal
// UUID and rejected with a 400.
router.post(
    "/:id/shares/link",
    rateLimit("share"),
    validateRequest(shareResourceIdParamSchema, "params"),
    validateRequest(publicLinkCreateSchema, "body"),
    loadResource("file"),
    authorize("can_share"),
    createShareLink
);

router.delete(
    "/:id/shares/link",
    rateLimit("share"),
    validateRequest(shareResourceIdParamSchema, "params"),
    loadResource("file"),
    authorize("can_share"),
    revokeShareLink
);

router.delete(
    "/:id/shares/:principalId",
    rateLimit("share"),
    validateRequest(shareRevokeParamSchema, "params"),
    loadResource("file"),
    authorize("can_share"),
    revokeShareGrant
);

// Soft-delete a file (keeps the object for restore).
router.delete(
    "/:id",
    rateLimit("write"),
    validateRequest(fileIdParamSchema, "params"),
    loadResource("file"),
    authorize("can_delete"),
    deleteFile
);

export default router;
