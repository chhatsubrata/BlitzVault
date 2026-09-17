/**
 * Tuple replay CLI — drains `fga_outbox` to OpenFGA (Week 3 Tue Dev3).
 *
 * The operator-facing half of the outbox: after an OpenFGA outage, a bad
 * deploy, or a store rebuilt with `docker compose down -v`, this pushes the
 * pending tuple rows through. The drain itself lives in
 * `shared/services/authz/outbox.ts`, so Wednesday's BullMQ worker runs the same
 * code path this command exercises by hand.
 *
 * Run (from backend/), with FGA_ENABLED=true and the store initialised:
 *   pnpm fga:replay                  # drain pending rows (up to --limit)
 *   pnpm fga:replay --dry-run        # list what would be drained
 *   pnpm fga:replay --retry-failed   # also re-attempt rows marked failed
 *   pnpm fga:replay --limit=50
 *   pnpm fga:replay --status         # counts per status, writes nothing
 *
 * Safe to re-run: replaying an existing tuple is a no-op in the adapter.
 * Exits non-zero if any row in the pass failed, so it can be a CI/ops check.
 */
import "reflect-metadata";

import AppDataSource from "../config/db";
import { env } from "../shared/config/env";
import {
    DEFAULT_DRAIN_LIMIT,
    countOutboxByStatus,
    createAuthorizationService,
    drainOutbox,
} from "../shared/services/authz";

const args = process.argv.slice(2);
const has = (flag: string): boolean => args.includes(flag);

const DRY_RUN = has("--dry-run");
const RETRY_FAILED = has("--retry-failed");
const STATUS_ONLY = has("--status");

const parseLimit = (): number => {
    const raw = args.find((arg) => arg.startsWith("--limit="))?.split("=")[1];
    if (raw === undefined) return DEFAULT_DRAIN_LIMIT;

    const limit = Number(raw);
    if (!Number.isInteger(limit) || limit <= 0) {
        console.error(`--limit must be a positive integer, got "${raw}".`);
        process.exit(1);
    }
    return limit;
};

const log = (step: string, detail: unknown): void => {
    console.log(`\n• ${step}`);
    console.log(typeof detail === "string" ? `  ${detail}` : detail);
};

const main = async (): Promise<void> => {
    // --status is a Postgres-only view; every other mode talks to OpenFGA.
    if (!STATUS_ONLY && (!env.FGA_ENABLED || !env.FGA_API_URL || !env.FGA_STORE_ID || !env.FGA_MODEL_ID)) {
        console.error(
            "FGA is not configured — run `pnpm fga:init --write-env` first and set FGA_ENABLED=true."
        );
        process.exit(1);
    }

    const limit = parseLimit();
    await AppDataSource.initialize();

    try {
        if (STATUS_ONLY) {
            log("fga_outbox", await countOutboxByStatus(AppDataSource));
            return;
        }

        // A fresh instance rather than the memoized one: this process makes a
        // handful of calls and exits, and nothing else shares the singleton.
        const authz = createAuthorizationService();
        const result = await drainOutbox(
            { authz, ds: AppDataSource },
            { limit, includeFailed: RETRY_FAILED, dryRun: DRY_RUN }
        );

        if (result.processed === 0) {
            log("nothing to replay", RETRY_FAILED ? "no pending or failed rows" : "no pending rows");
            return;
        }

        if (DRY_RUN) {
            for (const row of result.rows) {
                const { user, relation, object } = row.tuple;
                console.log(`  ${row.op.padEnd(6)} ${user}  ${relation}  ${object}   [${row.status}]`);
            }
            log("dry run", `${result.processed} row(s) would be replayed — nothing written`);
            return;
        }

        log("result", { processed: result.processed, done: result.done, failed: result.failed });

        if (result.failed > 0) {
            for (const row of result.rows.filter((candidate) => candidate.status === "failed")) {
                console.error(`  ✗ ${row.id}  ${row.op}  ${row.tuple.object}  — ${row.last_error}`);
            }
            console.error(
                `\n✗ ${result.failed} row(s) failed — fix the cause, then \`pnpm fga:replay --retry-failed\`.`
            );
            process.exit(1);
        }

        console.log("\n✓ Replay complete.");
    } finally {
        await AppDataSource.destroy();
    }
};

main().catch((error) => {
    console.error("\n✗ fga:replay failed:", error);
    process.exit(1);
});
