import dotenv from "dotenv";
import path from "path";
import { z } from "zod";

const environmentFiles = [".env.local", ".env"];

for (const fileName of environmentFiles) {
    dotenv.config({ path: path.resolve(process.cwd(), fileName) });
}

const DEFAULT_CORS_ORIGINS = "http://localhost:3000,http://localhost:3001";

const parseCommaSeparatedOrigins = (value: string): string[] =>
    value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);

const optionalNonEmptyString = z
    .string()
    .optional()
    .transform((value) => (value?.trim() ? value.trim() : undefined));

const envSchema = z
    .object({
        NODE_ENV: z
            .enum(["development", "test", "production", "staging"])
            .default("development"),
        DB_HOST: z.string().min(1),
        DB_PORT: z.coerce.number().int().positive(),
        DB_USERNAME: z.string().min(1),
        DB_PASSWORD: z.string().min(1),
        DB_DATABASE: z.string().min(1),
        PORT: z.coerce.number().int().positive().default(5001),
        CLERK_SECRET_KEY: z.string().min(1),
        CLERK_PUBLISHABLE_KEY: z.string().min(1),
        CLERK_JWT_ISSUER: z.string().min(1),
        CLERK_JWT_AUDIENCE: optionalNonEmptyString,
        CORS_ALLOWED_ORIGINS: z.string().min(1).default(DEFAULT_CORS_ORIGINS),
        REDIS_HOST: z.string().min(1).default("127.0.0.1"),
        REDIS_PORT: z.coerce.number().int().positive().default(6379),
        REDIS_PASSWORD: optionalNonEmptyString,
    })
    .strict();

const pickProcessEnv = () => ({
    NODE_ENV: process.env.NODE_ENV,
    DB_HOST: process.env.DB_HOST,
    DB_PORT: process.env.DB_PORT,
    DB_USERNAME: process.env.DB_USERNAME,
    DB_PASSWORD: process.env.DB_PASSWORD,
    DB_DATABASE: process.env.DB_DATABASE,
    PORT: process.env.PORT,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    CLERK_PUBLISHABLE_KEY: process.env.CLERK_PUBLISHABLE_KEY,
    CLERK_JWT_ISSUER: process.env.CLERK_JWT_ISSUER,
    CLERK_JWT_AUDIENCE: process.env.CLERK_JWT_AUDIENCE,
    CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS,
    REDIS_HOST: process.env.REDIS_HOST,
    REDIS_PORT: process.env.REDIS_PORT,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
});

const parseEnv = () => {
    const result = envSchema.safeParse(pickProcessEnv());

    if (!result.success) {
        const formatted = result.error.issues
            .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
            .join("\n");
        console.error(`Invalid environment configuration:\n${formatted}`);
        process.exit(1);
    }

    const parsed = result.data;

    return {
        ...parsed,
        CORS_ALLOWED_ORIGINS: parseCommaSeparatedOrigins(parsed.CORS_ALLOWED_ORIGINS),
    };
};

export const env = parseEnv();

export type Env = typeof env;
