import { MigrationInterface, QueryRunner } from "typeorm";

export class DropUsersPassword00021748100000000 implements MigrationInterface {
    name = "DropUsersPassword00021748100000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Column is unused: Clerk owns credentials, local DB never wrote it.
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "password"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "password" character varying(255)`);
    }
}
