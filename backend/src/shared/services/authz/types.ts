// Authorization contract wrapping OpenFGA (docs/openfga-model.md). Services and
// middleware depend on this interface, never the @openfga/sdk client directly —
// so the disabled/deny-by-default variant and future decorators (Redis cache,
// Wed) are drop-in. Mirrors the storage adapter module style (types + factory +
// barrel; named exports + no provider leakage).

/** Config needed to talk to an OpenFGA store. Validated at construction. */
export type FgaConfig = {
    /** OpenFGA API base URL, e.g. http://localhost:8080. */
    apiUrl: string;
    /** Target store id. */
    storeId: string;
    /** Pinned authorization model id — consistent reads across deploys. */
    modelId: string;
};

/**
 * A single relationship tuple. Ids are already namespaced by the caller
 * (`user:<id>`, `file:<id>`, `folder:<id>`, `public_link:<id>#accessor`, …) so
 * this layer stays model-agnostic and does no string building.
 */
export type TupleKey = {
    user: string;
    relation: string;
    object: string;
};

/** A permission question: may `user` perform `relation` on `object`? */
export type CheckRequest = TupleKey;

/** Tuples to add and/or remove in one write. */
export type WriteRequest = {
    writes?: TupleKey[];
    deletes?: TupleKey[];
};

/**
 * Provider-agnostic authorization service. Implementations: the live OpenFGA
 * adapter and the disabled deny-by-default stub (FGA_ENABLED=false).
 */
export interface AuthorizationService {
    /** True iff `user` has `relation` on `object`. Deny-by-default on any doubt. */
    check(request: CheckRequest): Promise<boolean>;
    /**
     * Batched `check`. Returns one boolean per input, in the same order.
     * Used by list endpoints (Thu) to filter to viewable items without N calls.
     */
    batchCheck(requests: CheckRequest[]): Promise<boolean[]>;
    /** Add/remove tuples. Idempotent: duplicate writes / missing deletes are no-ops. */
    write(request: WriteRequest): Promise<void>;
}
