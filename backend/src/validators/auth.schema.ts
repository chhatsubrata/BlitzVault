import { z } from "zod";

const IDENTIFIER_MIN_LENGTH = 3;
const PASSWORD_MIN_LENGTH = 8;
const OAUTH_STATE_MIN_LENGTH = 10;

export const authSignUpSchema = z.object({
    email: z.string().trim().email("email must be a valid email address"),
    username: z
        .string()
        .trim()
        .min(IDENTIFIER_MIN_LENGTH, `username must be at least ${IDENTIFIER_MIN_LENGTH} characters`),
    password: z
        .string()
        .min(PASSWORD_MIN_LENGTH, `password must be at least ${PASSWORD_MIN_LENGTH} characters`),
});

export const authPasswordSignInSchema = z.object({
    identifier: z
        .string()
        .trim()
        .min(IDENTIFIER_MIN_LENGTH, `identifier must be at least ${IDENTIFIER_MIN_LENGTH} characters`),
    password: z
        .string()
        .min(PASSWORD_MIN_LENGTH, `password must be at least ${PASSWORD_MIN_LENGTH} characters`),
});

export const authGoogleStartSchema = z.object({
    state: z
        .string()
        .trim()
        .min(OAUTH_STATE_MIN_LENGTH, `state must be at least ${OAUTH_STATE_MIN_LENGTH} characters`)
        .optional(),
});

export const authGoogleCallbackSchema = z.object({
    state: z
        .string()
        .trim()
        .min(OAUTH_STATE_MIN_LENGTH, `state must be at least ${OAUTH_STATE_MIN_LENGTH} characters`),
    token: z.string().trim().min(1, "token is required"),
});
