import express from "express";

import { requireAuth } from "../../middleware/requireAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { rateLimit } from "../../shared/middleware/rate-limit";
import { fileUploadCompleteSchema, fileUploadInitSchema } from "./files.schema";
import { completeUpload, initUpload } from "./files.controller";

const router = express.Router();

// All file routes require a valid Clerk bearer token.
router.use(requireAuth);

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

export default router;
