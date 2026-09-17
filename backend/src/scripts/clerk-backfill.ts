/**
 * Mirror every Clerk user into the local `users` table.
 *
 * Normally a row appears the first time someone signs in and the app calls
 * `POST /auth/sync`. Accounts created straight in the Clerk dashboard therefore
 * do not exist locally, which means they cannot be found by the share dialog's
 * member picker and cannot be granted access at all — a tuple needs a local
 * `user:<uuid>` subject.
 *
 * This is a one-off catch-up for exactly that gap. The durable fix is a Clerk
 * `user.created` webhook; until that lands, run this after adding people in the
 * dashboard.
 *
 * Run (from backend/):
 *   pnpm users:backfill --dry-run   # list what would change
 *   pnpm users:backfill
 *
 * Idempotent: it reuses `syncUserFromClerk`, the same path a login takes, so a
 * second run reports every user as unchanged.
 */
import "reflect-metadata";

import AppDataSource from "../config/db";
import { Users } from "../entities/Users";
import { syncUserFromClerk } from "../features/auth/auth.service";
import { listAllClerkUsers } from "../shared/services/clerk.service";

const DRY_RUN = process.argv.includes("--dry-run");

const log = (step: string, detail: unknown): void => {
    console.log(`\n• ${step}`);
    console.log(typeof detail === "string" ? `  ${detail}` : detail);
};

const primaryEmailOf = (
    clerkUser: Awaited<ReturnType<typeof listAllClerkUsers>>[number]
): string => {
    const primary = clerkUser.emailAddresses.find(
        (address) => address.id === clerkUser.primaryEmailAddressId
    );
    return primary?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress ?? "";
};

const main = async (): Promise<void> => {
    await AppDataSource.initialize();

    try {
        const clerkUsers = await listAllClerkUsers();
        log("clerk", `${clerkUsers.length} user(s) in the directory`);

        const existing = await AppDataSource.getRepository(Users).find({
            select: { clerk_user_id: true },
        });
        const known = new Set(existing.map((user) => user.clerk_user_id));

        const created: string[] = [];
        const updated: string[] = [];
        const skipped: string[] = [];

        for (const clerkUser of clerkUsers) {
            const email = primaryEmailOf(clerkUser);
            // An account with no email cannot be invited by email, and the
            // column is not nullable — report it rather than writing "".
            if (!email) {
                skipped.push(clerkUser.id);
                console.warn(`  ⚠ ${clerkUser.id} has no email address — skipped`);
                continue;
            }

            const isNew = !known.has(clerkUser.id);
            if (DRY_RUN) {
                console.log(`  ${isNew ? "create" : "update"}  ${email}`);
                (isNew ? created : updated).push(email);
                continue;
            }

            // Same mapping as a real login: username fallback, primary-email
            // preference and the relink-by-identity rules all live there.
            await syncUserFromClerk(clerkUser.id);
            (isNew ? created : updated).push(email);
            console.log(`  ${isNew ? "created" : "updated"}  ${email}`);
        }

        log(DRY_RUN ? "dry run" : "result", {
            created: created.length,
            updated: updated.length,
            skipped: skipped.length,
        });

        if (DRY_RUN) {
            console.log("\nNothing written. Re-run without --dry-run to apply.");
            return;
        }
        console.log("\n✓ Backfill complete.");
    } finally {
        await AppDataSource.destroy();
    }
};

main().catch((error) => {
    console.error("\n✗ users:backfill failed:", error);
    process.exit(1);
});
