import { requestSchemas } from "./registry";

// Hand-assembled OpenAPI 3.0 document. Request bodies/params reference the
// Zod-generated component schemas (registry.ts) so they match validation 1:1.
// Two response envelopes are documented intentionally: the legacy
// {success,message,data} shape (auth/users routes via utils/responses.ts) and
// the target {data,meta} / {error} envelope (health/folders). See
// docs/api-guidelines.md and src/shared/types/api-envelope.ts.

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const bearerAuth = [{ bearerAuth: [] as string[] }];

const legacyResponse = (description: string) => ({
    description,
    content: { "application/json": { schema: ref("LegacyResponse") } },
});

const targetError = (description: string) => ({
    description,
    content: { "application/json": { schema: ref("ErrorResponse") } },
});

const targetSuccess = (description: string) => ({
    description,
    content: { "application/json": { schema: ref("SuccessResponse") } },
});

// Reusable parameter fragments (target-envelope routes hand-write `parameters[]`
// because a whole-object component `$ref` can't set per-field `in`/`name`).
const idPathParam = {
    name: "id",
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
};
const cursorParam = { name: "cursor", in: "query", required: false, schema: { type: "string" } };
const limitParam = {
    name: "limit",
    in: "query",
    required: false,
    schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
};

export const openApiDocument = {
    openapi: "3.0.3",
    info: {
        title: "BlitzVault API",
        version: "1.0.0",
        description:
            "Phase 0/1 API. Request schemas are generated from the frozen Zod contracts. " +
            "Auth/users routes return the legacy `{success,message,data}` envelope; " +
            "health/folders return the target `{data,meta}` / `{error}` envelope.",
    },
    servers: [{ url: "/", description: "Current host" }],
    tags: [
        { name: "Health" },
        { name: "Auth" },
        { name: "Users" },
        { name: "Folders" },
        { name: "Files" },
    ],
    components: {
        securitySchemes: {
            bearerAuth: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "JWT",
                description: "Clerk session JWT. Sent as `Authorization: Bearer <token>`.",
            },
        },
        schemas: {
            ...requestSchemas,
            // Target success envelope.
            SuccessResponse: {
                type: "object",
                required: ["data"],
                properties: {
                    data: { type: "object" },
                    meta: { type: "object", additionalProperties: true },
                },
            },
            // Target error envelope.
            ErrorResponse: {
                type: "object",
                required: ["error"],
                properties: {
                    error: {
                        type: "object",
                        required: ["code", "message"],
                        properties: {
                            code: { type: "string", example: "VALIDATION" },
                            message: { type: "string" },
                            details: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        path: { type: "string" },
                                        issue: { type: "string" },
                                    },
                                },
                            },
                            requestId: { type: "string" },
                        },
                    },
                },
            },
            // Legacy envelope (auth/users).
            LegacyResponse: {
                type: "object",
                required: ["success", "message"],
                properties: {
                    success: { type: "boolean" },
                    message: { type: "string" },
                    data: { type: "object" },
                    errors: { type: "array", items: { type: "string" } },
                },
            },
            // Phase 2 sharing (docs/api-guidelines.md → "Sharing & permission
            // envelope"). Declared Monday so the FE mirrors the shape before the
            // /shares paths land (Wed). Resolved from OpenFGA, not DB columns.
            SharePermissions: {
                type: "object",
                required: ["canRead", "canWrite", "canShare", "canDelete"],
                properties: {
                    canRead: { type: "boolean" },
                    canWrite: { type: "boolean" },
                    canShare: { type: "boolean" },
                    canDelete: { type: "boolean" },
                },
            },
            SharePrincipal: {
                type: "object",
                required: ["type", "id"],
                properties: {
                    type: { type: "string", enum: ["user", "team"] },
                    id: { type: "string" },
                    email: { type: "string" },
                },
            },
            ShareGrant: {
                type: "object",
                required: ["principal", "role"],
                properties: {
                    principal: ref("SharePrincipal"),
                    role: { type: "string", enum: ["editor", "viewer"] },
                },
            },
            SharePublicLink: {
                type: "object",
                required: ["token", "role", "url"],
                properties: {
                    token: { type: "string" },
                    role: { type: "string", enum: ["viewer"] },
                    url: { type: "string" },
                },
            },
            SharedWith: {
                type: "object",
                required: ["grants"],
                properties: {
                    grants: { type: "array", items: ref("ShareGrant") },
                    publicLink: {
                        oneOf: [ref("SharePublicLink"), { type: "null" }],
                    },
                },
            },
        },
    },
    paths: {
        "/healthz": {
            get: {
                tags: ["Health"],
                summary: "Liveness probe",
                responses: {
                    "200": {
                        description: "Process is up.",
                        content: { "application/json": { schema: ref("SuccessResponse") } },
                    },
                },
            },
        },
        "/readyz": {
            get: {
                tags: ["Health"],
                summary: "Readiness probe (DB reachable)",
                responses: {
                    "200": {
                        description: "Dependencies reachable.",
                        content: { "application/json": { schema: ref("SuccessResponse") } },
                    },
                    "503": targetError("Database not reachable."),
                },
            },
        },
        "/api/v1/auth/signup": {
            post: {
                tags: ["Auth"],
                summary: "Create Clerk account + sync local user",
                requestBody: {
                    required: true,
                    content: { "application/json": { schema: ref("AuthSignUp") } },
                },
                responses: {
                    "201": legacyResponse("Sign up successful."),
                    "400": legacyResponse("Validation or Clerk error."),
                },
            },
        },
        "/api/v1/auth/signin/password": {
            post: {
                tags: ["Auth"],
                summary: "Password sign-in",
                requestBody: {
                    required: true,
                    content: { "application/json": { schema: ref("AuthPasswordSignIn") } },
                },
                responses: {
                    "200": legacyResponse("Sign in successful."),
                    "401": legacyResponse("Invalid credentials."),
                },
            },
        },
        "/api/v1/auth/sync": {
            post: {
                tags: ["Auth"],
                summary: "Sync authenticated Clerk user into local DB",
                security: bearerAuth,
                responses: {
                    "200": legacyResponse("User synced successfully."),
                    "401": legacyResponse("Missing/invalid token."),
                },
            },
        },
        "/api/v1/auth/signout": {
            post: {
                tags: ["Auth"],
                summary: "Revoke current Clerk session",
                security: bearerAuth,
                responses: {
                    "200": legacyResponse("Sign out successful."),
                    "401": legacyResponse("Missing/invalid token."),
                },
            },
        },
        "/api/v1/users": {
            post: {
                tags: ["Users"],
                summary: "Create user",
                security: bearerAuth,
                requestBody: {
                    required: true,
                    content: { "application/json": { schema: ref("CreateUser") } },
                },
                responses: {
                    "201": legacyResponse("User created."),
                    "401": legacyResponse("Unauthenticated."),
                },
            },
            get: {
                tags: ["Users"],
                summary: "List users (page pagination)",
                security: bearerAuth,
                parameters: [
                    { name: "page", in: "query", required: false, schema: { type: "integer", minimum: 1, default: 1 } },
                    { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
                ],
                responses: {
                    "200": legacyResponse("List of users."),
                    "401": legacyResponse("Unauthenticated."),
                },
            },
        },
        "/api/v1/users/{id}": {
            get: {
                tags: ["Users"],
                summary: "Get user by id",
                security: bearerAuth,
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
                responses: {
                    "200": legacyResponse("User."),
                    "404": legacyResponse("Not found."),
                },
            },
            put: {
                tags: ["Users"],
                summary: "Update user",
                security: bearerAuth,
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
                requestBody: {
                    required: true,
                    content: { "application/json": { schema: ref("UpdateUser") } },
                },
                responses: {
                    "200": legacyResponse("User updated."),
                    "404": legacyResponse("Not found."),
                },
            },
            delete: {
                tags: ["Users"],
                summary: "Delete user",
                security: bearerAuth,
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
                responses: {
                    "200": legacyResponse("User deleted."),
                    "404": legacyResponse("Not found."),
                },
            },
        },
        "/api/v1/folders": {
            get: {
                tags: ["Folders"],
                summary: "List drive entries (cursor pagination)",
                security: bearerAuth,
                parameters: [
                    { name: "parentId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
                    { name: "cursor", in: "query", required: false, schema: { type: "string" } },
                    { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
                ],
                responses: {
                    "200": {
                        description: "Folders + files page with nextCursor.",
                        content: { "application/json": { schema: ref("SuccessResponse") } },
                    },
                    "400": targetError("Invalid query params."),
                    "401": targetError("Unauthenticated."),
                },
            },
            post: {
                tags: ["Folders"],
                summary: "Create a folder (null/absent parentId = root)",
                security: bearerAuth,
                requestBody: {
                    required: true,
                    content: { "application/json": { schema: ref("FolderCreate") } },
                },
                responses: {
                    "201": targetSuccess("Folder created."),
                    "400": targetError("Validation error."),
                    "401": targetError("Unauthenticated."),
                    "404": targetError("Parent folder not found."),
                },
            },
        },
        "/api/v1/folders/{id}": {
            patch: {
                tags: ["Folders"],
                summary: "Rename a folder",
                security: bearerAuth,
                parameters: [idPathParam],
                requestBody: {
                    required: true,
                    content: { "application/json": { schema: ref("FolderRename") } },
                },
                responses: {
                    "200": targetSuccess("Folder renamed."),
                    "400": targetError("Validation error."),
                    "401": targetError("Unauthenticated."),
                    "404": targetError("Folder not found."),
                },
            },
            delete: {
                tags: ["Folders"],
                summary: "Cascade soft-delete a folder + its subtree",
                security: bearerAuth,
                parameters: [idPathParam],
                responses: {
                    "200": targetSuccess("Folder (and subtree) soft-deleted."),
                    "401": targetError("Unauthenticated."),
                    "404": targetError("Folder not found."),
                },
            },
        },
        "/api/v1/folders/{id}/move": {
            patch: {
                tags: ["Folders"],
                summary: "Move (reparent) a folder; rejects cycles",
                security: bearerAuth,
                parameters: [idPathParam],
                requestBody: {
                    required: true,
                    content: { "application/json": { schema: ref("FolderMove") } },
                },
                responses: {
                    "200": targetSuccess("Folder moved."),
                    "400": targetError("Validation error."),
                    "401": targetError("Unauthenticated."),
                    "404": targetError("Folder or new parent not found."),
                    "409": targetError("Move would create a cycle."),
                },
            },
        },
        "/api/v1/folders/{id}/path": {
            get: {
                tags: ["Folders"],
                summary: "Breadcrumb trail (root -> self)",
                security: bearerAuth,
                parameters: [idPathParam],
                responses: {
                    "200": targetSuccess("Breadcrumb trail."),
                    "401": targetError("Unauthenticated."),
                    "404": targetError("Folder not found."),
                },
            },
        },
        "/api/v1/files": {
            get: {
                tags: ["Files"],
                summary: "List files within a folder (cursor pagination)",
                security: bearerAuth,
                parameters: [
                    { name: "folderId", in: "query", required: true, schema: { type: "string", format: "uuid" } },
                    cursorParam,
                    limitParam,
                ],
                responses: {
                    "200": targetSuccess("Files page with nextCursor."),
                    "400": targetError("Invalid query params."),
                    "401": targetError("Unauthenticated."),
                    "404": targetError("Folder not found."),
                },
            },
        },
        "/api/v1/files/trash": {
            get: {
                tags: ["Files"],
                summary: "List soft-deleted files (the trash)",
                security: bearerAuth,
                parameters: [cursorParam, limitParam],
                responses: {
                    "200": targetSuccess("Soft-deleted files page with nextCursor."),
                    "401": targetError("Unauthenticated."),
                },
            },
        },
        "/api/v1/files/upload/init": {
            post: {
                tags: ["Files"],
                summary: "Initialize a file upload (presigned). Idempotency-Key required.",
                security: bearerAuth,
                parameters: [
                    {
                        name: "Idempotency-Key",
                        in: "header",
                        required: true,
                        schema: { type: "string" },
                        description: "Dedupes retried upload-init calls.",
                    },
                ],
                requestBody: {
                    required: true,
                    content: { "application/json": { schema: ref("FileUploadInit") } },
                },
                responses: {
                    "201": targetSuccess("File reserved; presigned upload target returned."),
                    "400": targetError("Validation error or missing Idempotency-Key."),
                    "401": targetError("Unauthenticated."),
                    "404": targetError("Folder not found."),
                    "409": targetError("Storage quota exceeded."),
                },
            },
        },
        "/api/v1/files/upload/complete": {
            post: {
                tags: ["Files"],
                summary: "Finalize an upload once bytes are in storage (flips to ready)",
                security: bearerAuth,
                requestBody: {
                    required: true,
                    content: { "application/json": { schema: ref("FileUploadComplete") } },
                },
                responses: {
                    "200": targetSuccess("File finalized (ready)."),
                    "400": targetError("Validation error or checksum mismatch."),
                    "401": targetError("Unauthenticated."),
                    "404": targetError("File not found."),
                    "409": targetError("Object not yet present in storage."),
                },
            },
        },
        "/api/v1/files/restore": {
            post: {
                tags: ["Files"],
                summary: "Restore soft-deleted files (single or bulk, all-or-nothing)",
                security: bearerAuth,
                requestBody: {
                    required: true,
                    content: { "application/json": { schema: ref("FileRestore") } },
                },
                responses: {
                    "200": targetSuccess("Restored count."),
                    "400": targetError("Validation error."),
                    "401": targetError("Unauthenticated."),
                    "404": targetError("One or more ids are not currently-deleted owned files."),
                },
            },
        },
        "/api/v1/files/{id}/download": {
            get: {
                tags: ["Files"],
                summary: "Presigned, time-limited download URL",
                security: bearerAuth,
                parameters: [
                    idPathParam,
                    {
                        name: "expiresInSeconds",
                        in: "query",
                        required: false,
                        schema: { type: "integer", minimum: 60, maximum: 86400, default: 3600 },
                    },
                ],
                responses: {
                    "200": targetSuccess("Presigned download URL."),
                    "400": targetError("Invalid query params."),
                    "401": targetError("Unauthenticated."),
                    "404": targetError("File not found."),
                    "409": targetError("File is not ready."),
                },
            },
        },
        "/api/v1/files/{id}": {
            delete: {
                tags: ["Files"],
                summary: "Soft-delete a file (keeps the object for restore)",
                security: bearerAuth,
                parameters: [idPathParam],
                responses: {
                    "200": targetSuccess("File soft-deleted."),
                    "401": targetError("Unauthenticated."),
                    "404": targetError("File not found."),
                },
            },
        },
    },
} as const;

export type OpenApiDocument = typeof openApiDocument;
