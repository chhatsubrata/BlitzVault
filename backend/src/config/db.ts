import { DataSource } from "typeorm";
import { Users } from "../entities/Users";
import { Folders } from "../entities/Folders";
import { Files } from "../entities/Files";
import { env } from "../shared/config/env";

const AppDataSource = new DataSource({
    type: "postgres",
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_DATABASE,
    entities: [Users, Folders, Files],
    migrations: ["src/migrations/*.{ts,js}"],
    migrationsTableName: "typeorm_migrations",
    synchronize: env.NODE_ENV === "development",
    logging: false,
});

export default AppDataSource;