import { MigrationInterface, QueryRunner } from "typeorm";

export class FgaOutboxBackoff00061748500000000 implements MigrationInterface {
    name = "FgaOutboxBackoff00061748500000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Retry schedule for a failed tuple write. Without it the worker either
        // retries a poisoned row every tick or never retries a transient one.
        // IF NOT EXISTS because dev runs TypeORM `synchronize`, which adds the
        // column from the entity before this migration ever executes.
        await queryRunner.query(
            `ALTER TABLE "fga_outbox" ADD COLUMN IF NOT EXISTS "next_attempt_at" TIMESTAMP`
        );

        // The claim query reads pending + retryable-failed rows, oldest first.
        // The 0004 index only covers `status = 'pending'`, so a backlog of
        // failed rows would fall back to a sequential scan every tick.
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_fga_outbox_retryable"
            ON "fga_outbox" ("next_attempt_at", "created_at")
            WHERE "status" IN ('pending', 'failed')
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fga_outbox_retryable"`);
        await queryRunner.query(`ALTER TABLE "fga_outbox" DROP COLUMN IF EXISTS "next_attempt_at"`);
    }
}
