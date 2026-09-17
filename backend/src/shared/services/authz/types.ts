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

/**
 * Filter for reading stored tuples. `object` is required — every read in the
 * app is "who has access to this resource?"; an unfiltered scan of the store is
 * never what a request wants.
 */
export type ReadRequest = {
    object: string;
    relation?: string;
    user?: string;
};

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
    /**
     * Stored tuples matching a filter. The read model behind the share list:
     * grants live only in OpenFGA (docs/openfga-model.md), there is no grants
     * table to query. Unlike `check`, this returns what was written — no
     * inheritance or userset expansion.
     */
    readTuples(request: ReadRequest): Promise<TupleKey[]>;
}
