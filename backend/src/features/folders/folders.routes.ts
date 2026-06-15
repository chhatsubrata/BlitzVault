import express from "express";
import { requireAuth } from "../../middleware/requireAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { folderListSchema } from "./folders.schema";
import { listFolders } from "./folders.controller";

const router = express.Router();

// All folder routes require a valid Clerk bearer token.
router.use(requireAuth);

// List folders under a parent (root if no parentId). Cursor pagination.
router.get("/", validateRequest(folderListSchema, "query"), listFolders);

export default router;
