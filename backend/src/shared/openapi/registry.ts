import { z } from "zod";
import { authPasswordSignInSchema, authSignUpSchema } from "../../features/auth/auth.schema";
import { createUserSchema, listUsersQuerySchema, updateUserSchema, userIdParamsSchema } from "../../features/users/users.schema";
import { folderCreateSchema, folderListSchema } from "../../features/folders/folders.schema";
import { fileUploadCompleteSchema, fileUploadInitSchema } from "../../features/files/files.schema";

// Converts a frozen Zod request schema into an OpenAPI 3.0 schema object using
// Zod 4's native z.toJSONSchema. `unrepresentable: "any"` keeps coercion/transform
// schemas (e.g. z.coerce.number on query params) from throwing; `io: "input"`
// documents the wire shape the client sends.
type JsonSchemaObject = Record<string, unknown>;

const toOpenApiSchema = (schema: z.ZodType): JsonSchemaObject =>
    z.toJSONSchema(schema, {
        target: "openapi-3.0",
        unrepresentable: "any",
        io: "input",
    }) as JsonSchemaObject;

// component name -> schema, generated 1:1 from the Zod contracts so docs never
// drift from request validation.
export const requestSchemas: Record<string, JsonSchemaObject> = {
    AuthSignUp: toOpenApiSchema(authSignUpSchema),
    AuthPasswordSignIn: toOpenApiSchema(authPasswordSignInSchema),
    CreateUser: toOpenApiSchema(createUserSchema),
    UpdateUser: toOpenApiSchema(updateUserSchema),
    UserIdParams: toOpenApiSchema(userIdParamsSchema),
    ListUsersQuery: toOpenApiSchema(listUsersQuerySchema),
    FolderCreate: toOpenApiSchema(folderCreateSchema),
    FolderList: toOpenApiSchema(folderListSchema),
    FileUploadInit: toOpenApiSchema(fileUploadInitSchema),
    FileUploadComplete: toOpenApiSchema(fileUploadCompleteSchema),
};
