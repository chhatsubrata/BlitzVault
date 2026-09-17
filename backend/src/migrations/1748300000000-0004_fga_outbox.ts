import { MigrationInterface, QueryRunner } from "typeorm";

export class FgaOutbox00041748300000000 implements MigrationInterface {
    name = "FgaOutbox00041748300000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Transactional outbox for OpenFGA tuple writes (docs/openfga-model.md →
        // "Tuple write strategy"). A service saves the resource row AND its
        // outbox rows in one DB transaction; a worker drains pending rows to
        // OpenFGA. Never dual-write. Schema per docs/database-design.md.
        await queryRunner.query(`
            CREATE TABLE "fga_outbox" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "op" text NOT NULL,
                "tuple" jsonb NOT NULL,
                "status" text NOT NULL DEFAULT 'pending',
                "attempts" integer NOT NULL DEFAULT 0,
                "last_error" text,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "processed_at" TIMESTAMP,
                CONSTRAINT "PK_fga_outbox_id" PRIMARY KEY ("id")
            )
        `);

        // The drain query: pending rows, oldest first. Partial so the index
        // stays tiny once rows flip to done/failed.
        await queryRunner.query(`
            CREATE INDEX "IDX_fga_outbox_pending_created_at"
            ON "fga_outbox" ("created_at")
            WHERE "status" = 'pending'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "fga_outbox"`);
    }
}
