import { MigrationInterface, QueryRunner } from "typeorm";

export class FilesFolders00031748200000000 implements MigrationInterface {
    name = "FilesFolders00031748200000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        // folders first — files.folder_id references it.
        // workspace_id is nullable with no FK: workspaces lands in Phase 3.
        await queryRunner.query(`
            CREATE TABLE "folders" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "workspace_id" uuid,
                "parent_id" uuid,
                "name" text NOT NULL,
                "owner_id" uuid NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP,
                CONSTRAINT "PK_folders_id" PRIMARY KEY ("id"),
                CONSTRAINT "FK_folders_parent" FOREIGN KEY ("parent_id")
                    REFERENCES "folders" ("id") ON DELETE RESTRICT,
                CONSTRAINT "FK_folders_owner" FOREIGN KEY ("owner_id")
                    REFERENCES "users" ("id")
            )
        `);

        // Uniqueness + listing: one live name per (workspace, parent), case-insensitive.
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_folders_ws_parent_name_live"
            ON "folders" ("workspace_id", "parent_id", lower("name"))
            WHERE "deleted_at" IS NULL
        `);

        // Trash listing.
        await queryRunner.query(`
            CREATE INDEX "IDX_folders_deleted_at"
            ON "folders" ("deleted_at")
            WHERE "deleted_at" IS NOT NULL
        `);

        await queryRunner.query(`
            CREATE TABLE "files" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "workspace_id" uuid,
                "folder_id" uuid NOT NULL,
                "name" text NOT NULL,
                "size_bytes" bigint NOT NULL,
                "mime" text NOT NULL,
                "storage_key" text NOT NULL,
                "storage_provider" text NOT NULL,
                "checksum_sha256" bytea,
                "status" text NOT NULL DEFAULT 'pending',
                "owner_id" uuid NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                "deleted_at" TIMESTAMP,
                CONSTRAINT "PK_files_id" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_files_storage_key" UNIQUE ("storage_key"),
                CONSTRAINT "FK_files_folder" FOREIGN KEY ("folder_id")
                    REFERENCES "folders" ("id") ON DELETE RESTRICT,
                CONSTRAINT "FK_files_owner" FOREIGN KEY ("owner_id")
                    REFERENCES "users" ("id")
            )
        `);

        // Folder listing (live + trash partitioned by deleted_at).
        await queryRunner.query(`
            CREATE INDEX "IDX_files_folder_deleted_at"
            ON "files" ("folder_id", "deleted_at")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Reverse order: files (child) before folders (parent).
        await queryRunner.query(`DROP TABLE "files"`);
        await queryRunner.query(`DROP TABLE "folders"`);
    }
}
