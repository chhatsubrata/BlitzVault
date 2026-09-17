// Public surface of the authz module. Middleware + services import from here only.
export * from "./types";
export { createAuthorizationService, getAuthorizationService } from "./factory";
export { FgaAuthorizationService } from "./fga.adapter";
export { DisabledAuthorizationService } from "./noop.adapter";
export {
    DEFAULT_DRAIN_LIMIT,
    countOutboxByStatus,
    drainOutbox,
    type DrainDeps,
    type DrainOptions,
    type DrainResult,
    type OutboxCounts,
} from "./outbox";
