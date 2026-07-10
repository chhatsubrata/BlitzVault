// Live OpenFGA-backed AuthorizationService. Wraps the @openfga/sdk client,
// funnels every failure through UpstreamError (OpenFGA is an upstream dependency),
// and never leaks SDK internals. No caching here — the Redis cache decorator
// lands Wed (docs/sprint-week-3.md); this is the raw wrapper.

import { CredentialsMethod, OpenFgaClient } from "@openfga/sdk";

import { UpstreamError } from "../../errors/AppError";
import {
    AuthorizationService,
    CheckRequest,
    FgaConfig,
    WriteRequest,
} from "./types";

// OpenFGA rejects a batchCheck item without a correlationId, and does not
// guarantee response order — so we tag each check with its input index and map
// results back by that id.
const correlationIdFor = (index: number): string => `c${index}`;

export class FgaAuthorizationService implements AuthorizationService {
    private readonly client: OpenFgaClient;

    constructor(config: FgaConfig) {
        if (!config.apiUrl || !config.storeId || !config.modelId) {
            throw new UpstreamError(
                "OpenFGA is enabled but not configured — set FGA_API_URL, FGA_STORE_ID and FGA_MODEL_ID."
            );
        }

        this.client = new OpenFgaClient({
            apiUrl: config.apiUrl,
            storeId: config.storeId,
            authorizationModelId: config.modelId,
            // Local/dev OpenFGA runs unauthenticated. Swap to a preshared key or
            // OIDC via env when staging/prod OpenFGA requires it (later task).
            credentials: { method: CredentialsMethod.None },
        });
    }

    async check(request: CheckRequest): Promise<boolean> {
        try {
            const { allowed } = await this.client.check({
                user: request.user,
                relation: request.relation,
                object: request.object,
            });
            return allowed ?? false;
        } catch (error) {
            throw this.asUpstream(error, "OpenFGA check failed.");
        }
    }

    async batchCheck(requests: CheckRequest[]): Promise<boolean[]> {
        if (requests.length === 0) return [];

        try {
            const { result } = await this.client.batchCheck({
                checks: requests.map((request, index) => ({
                    user: request.user,
                    relation: request.relation,
                    object: request.object,
                    correlationId: correlationIdFor(index),
                })),
            });

            const allowedById = new Map(
                result.map((item) => [item.correlationId, item.allowed])
            );
            // Deny-by-default for any missing correlation id.
            return requests.map(
                (_request, index) =>
                    allowedById.get(correlationIdFor(index)) ?? false
            );
        } catch (error) {
            throw this.asUpstream(error, "OpenFGA batchCheck failed.");
        }
    }

    async write(request: WriteRequest): Promise<void> {
        const writes = request.writes ?? [];
        const deletes = request.deletes ?? [];
        if (writes.length === 0 && deletes.length === 0) return;

        try {
            await this.client.write({
                writes: writes.length > 0 ? writes : undefined,
                deletes: deletes.length > 0 ? deletes : undefined,
            });
        } catch (error) {
            // Duplicate writes / missing deletes are benign — the outbox worker
            // (Wed) replays, so writes must be idempotent. Only these are swallowed.
            if (this.isBenignWriteConflict(error)) return;
            throw this.asUpstream(error, "OpenFGA write failed.");
        }
    }

    // OpenFGA returns HTTP 400 with code write_failed_due_to_invalid_input for
    // duplicate writes / deleting a non-existent tuple. Treat those as no-ops.
    private isBenignWriteConflict(error: unknown): boolean {
        const code = this.errorCode(error);
        return (
            code === "write_failed_due_to_invalid_input" ||
            code === "cannot_allow_duplicate_tuples_in_one_request"
        );
    }

    private errorCode(error: unknown): string | undefined {
        if (error && typeof error === "object") {
            const maybe = error as { responseData?: { code?: string }; code?: string };
            return maybe.responseData?.code ?? maybe.code;
        }
        return undefined;
    }

    private asUpstream(error: unknown, fallback: string): UpstreamError {
        const message = error instanceof Error ? error.message : String(error);
        return new UpstreamError(`${fallback} (${message})`);
    }
}
