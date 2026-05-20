import { DataSource } from "typeorm";
import { config } from "./dotenv";

const AppDataSource = new DataSource({
    type: "postgres",
    host: config.DB_HOST,
    port: Number(config.DB_PORT),
    username: config.DB_USERNAME,
    password: config.DB_PASSWORD,
    database: config.DB_DATABASE,
    entities: ["src/entities/*.ts"],
    synchronize: true,
    logging: false,
});

export default AppDataSource;