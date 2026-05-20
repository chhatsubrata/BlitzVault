import dotenv from 'dotenv'
import path from 'path'

const environmentFiles = ['.env.local', '.env']

for (const fileName of environmentFiles) {
    dotenv.config({ path: path.resolve(process.cwd(), fileName) })
}

const requireEnv = (key: string): string => {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
};

export const config = {
    DB_HOST: process.env.DB_HOST,
    DB_PORT: process.env.DB_PORT,
    DB_USERNAME: process.env.DB_USERNAME,
    DB_PASSWORD: process.env.DB_PASSWORD,
    DB_DATABASE: process.env.DB_DATABASE,
    PORT: process.env.PORT,
    AUTH_BEARER_TOKEN: process.env.AUTH_BEARER_TOKEN,
    CLERK_PUBLISHABLE_KEY: requireEnv("CLERK_PUBLISHABLE_KEY"),
    CLERK_SECRET_KEY: requireEnv("CLERK_SECRET_KEY"),
    CLERK_JWT_ISSUER: requireEnv("CLERK_JWT_ISSUER"),
    CLERK_JWT_AUDIENCE: process.env.CLERK_JWT_AUDIENCE,
    CLERK_GOOGLE_REDIRECT_URL: requireEnv("CLERK_GOOGLE_REDIRECT_URL"),
    CLERK_GOOGLE_CALLBACK_URL: requireEnv("CLERK_GOOGLE_CALLBACK_URL"),
}   