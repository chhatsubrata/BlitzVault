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
                    "401": targetError("Unauthenticated."),
                },
            },
        },
        // Documented target contract (route lands Week 2). Idempotency-Key required.
        "/api/v1/files/upload/init": {
            post: {
                tags: ["Files"],
                summary: "Initialize a file upload (presigned)",
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
                    "200": {
                        description: "Presigned upload target.",
                        content: { "application/json": { schema: ref("SuccessResponse") } },
                    },
                    "401": targetError("Unauthenticated."),
                },
            },
        },
    },
} as const;

export type OpenApiDocument = typeof openApiDocument;
