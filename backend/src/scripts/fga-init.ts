/**
 * OpenFGA store + model init (Week 3 Mon Dev3).
 *
 * The compose `openfga-migrate` service only creates OpenFGA's own tables; it
 * never touches the authorization model. This script does the rest, and is
 * safe to run as often as you like:
 *
 *   1. find the store named STORE_NAME, or create it
 *   2. read the store's latest model; write backend/src/authz/model.fga only
 *      if it differs (OpenFGA mints a NEW model id on every write, so an
 *      unconditional write would churn FGA_MODEL_ID on every run)
 *   3. print the four FGA_* lines; with --write-env, upsert the two ids into
 *      backend/.env.local
 *
 * Run (from backend/), after `docker compose -f docker-compose.dev.yml up -d`:
 *   pnpm fga:init --write-env
 *   pnpm fga:init --write-env --force     # rewrite the model even if unchanged
 *
 * Does NOT require FGA_ENABLED=true — init runs before you would turn it on.
 * Only FGA_API_URL is read (default http://localhost:8080).
 *
 * Talks to @openfga/sdk directly rather than through AuthorizationService: the
 * adapter hard-requires a model id, which is exactly what does not exist yet.
 * That rule is for services and middleware; scripts/ is the one place the SDK
 * is allowed to surface.
 */
import fs from "fs";
import path from "path";
import { FgaApiNotFoundError, OpenFgaClient } from "@openfga/sdk";
import { transformer } from "@openfga/syntax-transformer";

import { env } from "../shared/config/env";

const STORE_NAME = "blitzvault";
const DEFAULT_API_URL = "http://localhost:8080";
const MODEL_PATH = path.resolve(__dirname, "../authz/model.fga");
const ENV_LOCAL_PATH = path.resolve(process.cwd(), ".env.local");
const LIST_PAGE_SIZE = 50;

const args = new Set(process.argv.slice(2));
const WRITE_ENV = args.has("--write-env");
const FORCE = args.has("--force");

const log = (step: string, detail: unknown): void => {
    console.log(`\n• ${step}`);
    console.log(typeof detail === "string" ? `  ${detail}` : detail);
};

// --- Store: find by name, or create -----------------------------------------

type StoreSummary = { id: string; name: string; createdAt: string };

const listAllStores = async (client: OpenFgaClient): Promise<StoreSummary[]> => {
    const stores: StoreSummary[] = [];
    let continuationToken: string | undefined;

    do {
        const page = await client.listStores({
            pageSize: LIST_PAGE_SIZE,
            continuationToken,
        });
        for (const store of page.stores) {
            stores.push({ id: store.id, name: store.name, createdAt: store.created_at });
        }
        continuationToken = page.continuation_token || undefined;
    } while (continuationToken);

    return stores;
};

const findOrCreateStore = async (client: OpenFgaClient): Promise<string> => {
    // Filter client-side rather than via the server `name` param so behaviour
    // is identical across every 1.x server.
    const matches = (await listAllStores(client)).filter(
        (store) => store.name === STORE_NAME
    );

    if (matches.length === 0) {
        const created = await client.createStore({ name: STORE_NAME });
        log("store created", `${STORE_NAME}  ${created.id}`);
        return created.id;
    }

    if (matches.length > 1) {
        matches.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        console.warn(
            `\n⚠ ${matches.length} stores named "${STORE_NAME}" — using the oldest. ` +
                `Someone ran a manual store create; delete the extras:\n` +
                matches
                    .slice(1)
                    .map((store) => `    ${store.id}  (created ${store.createdAt})`)
                    .join("\n")
        );
    }

    log("store found", `${STORE_NAME}  ${matches[0].id}`);
    return matches[0].id;
};

// --- Model: write only if changed -------------------------------------------

/**
 * Both sides are proto-JSON of the same message, but the server fills in
 * defaults (null, "", {}, []) and marshals maps in sorted-key order. Strip the
 * defaults and sort keys so a byte-equal model compares equal.
 */
const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) {
        const items = value.map(normalize).filter((item) => item !== undefined);
        return items.length > 0 ? items : undefined;
    }
    if (value !== null && typeof value === "object") {
        const entries = Object.keys(value as Record<string, unknown>)
            .sort()
            .map((key) => [key, normalize((value as Record<string, unknown>)[key])] as const)
            .filter(([key, item]) => key !== "id" && item !== undefined);
        return entries.length > 0 ? Object.fromEntries(entries) : undefined;
    }
    if (value === null || value === "") {
        return undefined;
    }
    return value;
};

const fingerprint = (model: unknown): string => JSON.stringify(normalize(model));

const readRemoteModel = async (client: OpenFgaClient) => {
    try {
        const { authorization_model } = await client.readLatestAuthorizationModel();
        return authorization_model;
    } catch (error) {
        // A fresh store has no model yet.
        if (error instanceof FgaApiNotFoundError) return undefined;
        throw error;
    }
};

const ensureModel = async (client: OpenFgaClient): Promise<string> => {
    const dsl = fs.readFileSync(MODEL_PATH, "utf8");
    const local = transformer.transformDSLToJSONObject(dsl);
    const remote = await readRemoteModel(client);

    if (remote && !FORCE && fingerprint(remote) === fingerprint(local)) {
        log("model unchanged", `${remote.id}  (${path.relative(process.cwd(), MODEL_PATH)})`);
        return remote.id;
    }

    const written = await client.writeAuthorizationModel({
        schema_version: local.schema_version,
        type_definitions: local.type_definitions,
        conditions: local.conditions,
    });

    log(
        remote ? (FORCE ? "model rewritten (--force)" : "model changed, written") : "model written",
        written.authorization_model_id
    );
    return written.authorization_model_id;
};

// --- .env.local upsert ------------------------------------------------------

const upsertEnvLine = (content: string, key: string, value: string): string => {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^\\s*${key}=.*$`, "m");
    if (pattern.test(content)) {
        return content.replace(pattern, line);
    }
    const suffix = content.endsWith("\n") || content.length === 0 ? "" : "\n";
    return `${content}${suffix}${line}\n`;
};

const appendIfAbsent = (content: string, key: string, value: string): string =>
    new RegExp(`^\\s*${key}=`, "m").test(content)
        ? content
        : upsertEnvLine(content, key, value);

const writeEnvLocal = (apiUrl: string, storeId: string, modelId: string): void => {
    if (!fs.existsSync(ENV_LOCAL_PATH)) {
        console.error(
            `\n✗ ${ENV_LOCAL_PATH} does not exist — copy backend/.env.example first, then paste:\n` +
                `    FGA_ENABLED=true\n    FGA_API_URL=${apiUrl}\n` +
                `    FGA_STORE_ID=${storeId}\n    FGA_MODEL_ID=${modelId}`
        );
        process.exit(1);
    }

    const before = fs.readFileSync(ENV_LOCAL_PATH, "utf8");
    let after = before;

    if (!/^\s*FGA_/m.test(after)) {
        const suffix = after.endsWith("\n") || after.length === 0 ? "" : "\n";
        after = `${after}${suffix}\n# OpenFGA — ids from \`pnpm fga:init --write-env\`\n`;
    }
    // Never flip an explicit FGA_ENABLED=false; only add when absent.
    after = appendIfAbsent(after, "FGA_ENABLED", "true");
    after = appendIfAbsent(after, "FGA_API_URL", apiUrl);
    after = upsertEnvLine(after, "FGA_STORE_ID", storeId);
    after = upsertEnvLine(after, "FGA_MODEL_ID", modelId);

    if (after === before) {
        log(".env.local unchanged", ENV_LOCAL_PATH);
        return;
    }
    fs.writeFileSync(ENV_LOCAL_PATH, after);
    log(".env.local updated", ENV_LOCAL_PATH);
};

// --- Main -------------------------------------------------------------------

const main = async (): Promise<void> => {
    const apiUrl = env.FGA_API_URL ?? DEFAULT_API_URL;
    log("openfga", apiUrl);

    const rootClient = new OpenFgaClient({ apiUrl });
    const storeId = await findOrCreateStore(rootClient);

    const storeClient = new OpenFgaClient({ apiUrl, storeId });
    const modelId = await ensureModel(storeClient);

    console.log(
        `\nFGA_ENABLED=true\nFGA_API_URL=${apiUrl}\nFGA_STORE_ID=${storeId}\nFGA_MODEL_ID=${modelId}`
    );

    if (WRITE_ENV) {
        writeEnvLocal(apiUrl, storeId, modelId);
    }

    console.log(
        "\n✓ OpenFGA ready. FGA_MODEL_ID is read at boot — restart `pnpm dev` and the worker if it changed."
    );
};

main().catch((error) => {
    console.error("\n✗ fga:init failed:", error);
    process.exit(1);
});
