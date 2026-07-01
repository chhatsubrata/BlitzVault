import express from "express";

import { requireAuth } from "../../middleware/requireAuth";
import { validateRequest } from "../../middleware/validateRequest";
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
    downloadFile
);

// Soft-delete a file (keeps the object for restore).
router.delete(
    "/:id",
    rateLimit("write"),
    validateRequest(fileIdParamSchema, "params"),
    deleteFile
);

export default router;
