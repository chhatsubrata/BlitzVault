import { MigrationInterface, QueryRunner } from "typeorm";

export class UsersAvatarUrl00051748400000000 implements MigrationInterface {
    name = "UsersAvatarUrl00051748400000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Mirrors Clerk's `imageUrl`, but only when `hasImage` is true — Clerk
        // returns a generated placeholder otherwise, and the app draws its own
        // initials avatar for that case. Nullable: most accounts have no photo.
        // IF NOT EXISTS because dev runs TypeORM `synchronize`, which adds the
        // column from the entity before this ever runs; without it the first
        // `migration:run` on a developer machine fails on a name collision.
        await queryRunner.query(
            `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" text`
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "avatar_url"`);
    }
}
