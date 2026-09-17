// Public surface of the authz module. Middleware + services import from here only.
export * from "./types";
export { createAuthorizationService, getAuthorizationService } from "./factory";
export { FgaAuthorizationService } from "./fga.adapter";
export {
    CachedAuthorizationService,
    authzCacheEnabled,
    closeAuthzCache,
    invalidateResource,
    objectsOf,
} from "./cache";
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
export {
    OWNER_ACCESS,
    resolveItemAccess,
    type AccessQuery,
    type AccessRole,
    type ItemAccess,
    type SharePermissions,
} from "./permissions";
export {
    enqueueTuples,
    fileRef,
    folderRef,
    ownershipTuples,
    userRef,
    type TupleOp,
} from "./outbox-writer";
