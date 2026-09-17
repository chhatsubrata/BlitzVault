import { MigrationInterface, QueryRunner } from "typeorm";

export class ShareLinks00071748600000000 implements MigrationInterface {
    name = "ShareLinks00071748600000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Anyone-with-the-link sharing. The grant lives in OpenFGA
        // (public_link:<id>#accessor -> viewer); this table is what turns an
        // opaque token back into that link, and the only place expiry and
        // revocation can be recorded. `id` doubles as the FGA object id.
        // IF NOT EXISTS because dev runs TypeORM `synchronize`, which creates
        // the table from the entity before this migration ever executes.
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "share_links" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "resource_type" text NOT NULL,
                "resource_id" uuid NOT NULL,
                "token" text NOT NULL,
                "permission" text NOT NULL DEFAULT 'viewer',
                "password_hash" text,
                "expires_at" TIMESTAMP,
                "created_by" uuid NOT NULL,
                "revoked_at" TIMESTAMP,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_share_links" PRIMARY KEY ("id"),
                CONSTRAINT "CHK_share_links_resource_type"
                    CHECK ("resource_type" IN ('file', 'folder'))
            )
        `);

        // Resolution is a lookup by token on every public page view.
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_share_links_token"
            ON "share_links" ("token")
        `);

        // At most one live link per resource, enforced by the database rather
        // than by a read-then-write in the service: two concurrent "create
        // link" clicks would otherwise mint two tokens and the share dialog
        // could only ever show one of them, silently orphaning the other.
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_share_links_active_resource"
            ON "share_links" ("resource_type", "resource_id")
            WHERE "revoked_at" IS NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_share_links_active_resource"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_share_links_token"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "share_links"`);
    }
}
