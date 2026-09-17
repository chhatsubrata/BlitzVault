/**
 * Backfill OpenFGA tuples for rows that predate authorization (Week 3 Tue).
 *
 * For every non-deleted folder and file:
 *   user:<owner_id>      owner   folder:<id> | file:<id>
 *   folder:<parent_id>   parent  folder:<id>          (nested folders)
 *   folder:<folder_id>   parent  file:<id>
 *
 * Owner tuples make authorize() pass for existing data; parent tuples make
 * inheritance real so sharing a folder (Wed) reaches its contents.
 *
 * Run (from backend/), with FGA_ENABLED=true and the store initialised:
 *   pnpm fga:seed             # write what is missing
 *   pnpm fga:seed --dry-run   # list what would be written
 *
 * Idempotent, and re-running reports zero new writes. It deliberately does NOT
 * go through AuthorizationService.write: OpenFGA's write is transactional per
 * request, so one already-present tuple fails the whole batch — and the adapter
 * treats that as benign, which would silently drop every new tuple in the
 * batch. The SDK is used directly (scripts are the one place that is allowed)
 * in non-transactional mode, which reports each tuple's outcome individually.
 *
 * One-off backfill only. Runtime writes go through fga_outbox (Wed).
 */
import "reflect-metadata";
import { ClientWriteStatus, OpenFgaClient } from "@openfga/sdk";
import { IsNull } from "typeorm";

import AppDataSource from "../config/db";
import { Files } from "../entities/Files";
import { Folders } from "../entities/Folders";
import { env } from "../shared/config/env";
import type { TupleKey } from "../shared/services/authz/types";

// OpenFGA caps a write request at 100 tuples; non-transactional mode splits
// into per-tuple requests anyway, so this only bounds memory + log cadence.
const CHUNK_SIZE = 100;
const DRY_RUN = process.argv.includes("--dry-run");

const ALREADY_PRESENT_CODES = new Set([
    "write_failed_due_to_invalid_input",
    "cannot_allow_duplicate_tuples_in_one_request",
]);

const log = (step: string, detail: unknown): void => {
    console.log(`\n• ${step}`);
    console.log(typeof detail === "string" ? `  ${detail}` : detail);
};

const errorCode = (error: unknown): string | undefined => {
    if (error && typeof error === "object") {
        const maybe = error as { responseData?: { code?: string }; code?: string };
        return maybe.responseData?.code ?? maybe.code;
    }
    return undefined;
};

const collectTuples = async (): Promise<TupleKey[]> => {
    const tuples: TupleKey[] = [];

    const folders = await AppDataSource.getRepository(Folders).find({
        where: { deleted_at: IsNull() },
        select: { id: true, owner_id: true, parent_id: true },
    });
    for (const folder of folders) {
        const object = `folder:${folder.id}`;
        tuples.push({ user: `user:${folder.owner_id}`, relation: "owner", object });
        if (folder.parent_id) {
            tuples.push({ user: `folder:${folder.parent_id}`, relation: "parent", object });
        }
    }

    const files = await AppDataSource.getRepository(Files).find({
        where: { deleted_at: IsNull() },
        select: { id: true, owner_id: true, folder_id: true },
    });
    for (const file of files) {
        const object = `file:${file.id}`;
        tuples.push({ user: `user:${file.owner_id}`, relation: "owner", object });
        tuples.push({ user: `folder:${file.folder_id}`, relation: "parent", object });
    }

    log("rows", `${folders.length} folders, ${files.length} files → ${tuples.length} tuples`);
    return tuples;
};

type Outcome = { written: number; present: number; failed: TupleKey[] };

const writeTuples = async (client: OpenFgaClient, tuples: TupleKey[]): Promise<Outcome> => {
    const outcome: Outcome = { written: 0, present: 0, failed: [] };

    for (let start = 0; start < tuples.length; start += CHUNK_SIZE) {
        const chunk = tuples.slice(start, start + CHUNK_SIZE);
        const result = await client.write(
            { writes: chunk },
            // Per-tuple requests + per-tuple results; a duplicate never
            // poisons its neighbours.
            { transaction: { disable: true, maxPerChunk: 1 } }
        );

        for (const item of result.writes) {
            if (item.status === ClientWriteStatus.SUCCESS) {
                outcome.written += 1;
            } else if (ALREADY_PRESENT_CODES.has(errorCode(item.err) ?? "")) {
                outcome.present += 1;
            } else {
                outcome.failed.push(item.tuple_key as TupleKey);
                console.error("  ✗", item.tuple_key, item.err?.message ?? item.err);
            }
        }
        console.log(`  … ${Math.min(start + CHUNK_SIZE, tuples.length)}/${tuples.length}`);
    }

    return outcome;
};

const main = async (): Promise<void> => {
    if (!env.FGA_ENABLED || !env.FGA_API_URL || !env.FGA_STORE_ID || !env.FGA_MODEL_ID) {
        console.error(
            "FGA is not configured — run `pnpm fga:init --write-env` first and set FGA_ENABLED=true."
        );
        process.exit(1);
    }

    await AppDataSource.initialize();
    try {
        const tuples = await collectTuples();

        if (DRY_RUN) {
            for (const tuple of tuples) {
                console.log(`  ${tuple.user}  ${tuple.relation}  ${tuple.object}`);
            }
            log("dry run", "nothing written");
            return;
        }

        const client = new OpenFgaClient({
            apiUrl: env.FGA_API_URL,
            storeId: env.FGA_STORE_ID,
            authorizationModelId: env.FGA_MODEL_ID,
        });

        const outcome = await writeTuples(client, tuples);
        log("result", {
            written: outcome.written,
            alreadyPresent: outcome.present,
            failed: outcome.failed.length,
        });

        if (outcome.failed.length > 0) {
            console.error(`\n✗ ${outcome.failed.length} tuple(s) failed — see above.`);
            process.exit(1);
        }
        console.log("\n✓ Seed complete.");
    } finally {
        await AppDataSource.destroy();
    }
};

main().catch((error) => {
    console.error("\n✗ fga:seed failed:", error);
    process.exit(1);
});
