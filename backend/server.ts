import "reflect-metadata";
import { app } from "./src/app";
import AppDataSource from "./src/config/db";
import { env } from "./src/shared/config/env";
import { logger } from "./src/shared/utils/logger";

// Process lifecycle: connect the database, then start listening. The app itself
// (middleware + routes) is built in src/app.ts so it can be imported by tests.
AppDataSource.initialize()
    .then(() => {
        logger.info("database connected");
    })
    .catch((error) => {
        logger.error({ err: error }, "database connection error");
        process.exit(1);
    });

app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "server started");
});
