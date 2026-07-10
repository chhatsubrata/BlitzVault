/**
 * Live OpenFGA smoke test for the AuthorizationService (Week 3 Mon Dev1).
 *
 * Exercises the wrapper against a running OpenFGA store:
 *   write(owner tuple) -> check(can_read) == true -> check(other user) == false
 *
 * Requires a live store + loaded model (Dev3 compose service) and creds in
 * backend/.env.local:
 *   FGA_ENABLED=true
 *   FGA_API_URL=http://localhost:8080
 *   FGA_STORE_ID=<store id>
 *   FGA_MODEL_ID=<authorization_model_id>
 *
 * Run (from backend/):
 *   pnpm ts-node src/scripts/fga-smoke.ts
 *
 * This is the Monday acceptance: check() returns a live result vs local OpenFGA.
 */
import { env } from "../shared/config/env";
import { createAuthorizationService } from "../shared/services/authz";

const log = (step: string, detail: unknown): void => {
    console.log(`\n• ${step}`);
    console.log(typeof detail === "string" ? `  ${detail}` : detail);
};

const main = async (): Promise<void> => {
    if (!env.FGA_ENABLED) {
        console.error(
            "FGA_ENABLED is false — set it (and FGA_API_URL/STORE_ID/MODEL_ID) in backend/.env.local first."
        );
        process.exit(1);
    }

    const authz = createAuthorizationService();

    // Unique per run so re-runs don't collide on an existing tuple.
    const fileId = `file:smoke_${Date.now()}`;
    const owner = "user:smoke_owner";
    const stranger = "user:smoke_stranger";

    log("write owner tuple", { user: owner, relation: "owner", object: fileId });
    await authz.write({
        writes: [{ user: owner, relation: "owner", object: fileId }],
    });

    const ownerCanRead = await authz.check({
        user: owner,
        relation: "can_read",
        object: fileId,
    });
    log("owner can_read", `allowed: ${ownerCanRead}  (expected true)`);

    const strangerCanRead = await authz.check({
        user: stranger,
        relation: "can_read",
        object: fileId,
    });
    log("stranger can_read", `allowed: ${strangerCanRead}  (expected false)`);

    // Clean up the tuple so the store doesn't accumulate smoke data.
    await authz.write({
        deletes: [{ user: owner, relation: "owner", object: fileId }],
    });
    log("cleanup", "owner tuple deleted");

    if (!ownerCanRead || strangerCanRead) {
        console.error("\n✗ Smoke FAILED — check the model is loaded + model id pinned.");
        process.exit(1);
    }
    console.log("\n✓ OpenFGA smoke passed.");
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
