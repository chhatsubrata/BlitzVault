import { z } from "zod";

const USERNAME_MIN_LENGTH = 3;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export const createUserSchema = z.object({
    clerk_user_id: z.string().trim().min(1, "clerk_user_id is required"),
    email: z.string().trim().email("email must be a valid email address"),
    username: z
        .string()
        .trim()
        .min(USERNAME_MIN_LENGTH, `username must be at least ${USERNAME_MIN_LENGTH} characters`),
});

export const updateUserSchema = z
    .object({
        email: z.string().trim().email("email must be a valid email address").optional(),
        username: z
            .string()
            .trim()
            .min(USERNAME_MIN_LENGTH, `username must be at least ${USERNAME_MIN_LENGTH} characters`)
            .optional(),
    })
    .refine(
        (data) =>
            data.email !== undefined ||
            data.username !== undefined,
        {
            message: "At least one field (email, username) is required.",
        }
    );

export const userIdParamsSchema = z.object({
    id: z.string().uuid("id must be a valid UUID"),
});

export const listUsersQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(DEFAULT_PAGE),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
});
