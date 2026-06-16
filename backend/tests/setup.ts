import "reflect-metadata";
import { afterAll, beforeAll } from "vitest";
import AppDataSource from "../src/config/db";

// Integration tests hit a real Postgres (compose locally, service container in
// CI) with migrations already applied. Initialize the shared DataSource once,
// tear it down after the suite.
beforeAll(async () => {
    if (!AppDataSource.isInitialized) {
        // Migrations are already applied to the test DB; clear the glob so TypeORM
        // doesn't try to require the raw .ts migration files (they bypass Vitest's
        // SWC transform and fail as ESM-in-CJS).
        AppDataSource.setOptions({ migrations: [] });
        await AppDataSource.initialize();
    }
});

afterAll(async () => {
    if (AppDataSource.isInitialized) {
        await AppDataSource.destroy();
    }
});
