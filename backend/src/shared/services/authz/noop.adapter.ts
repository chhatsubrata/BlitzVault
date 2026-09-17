// Deny-by-default AuthorizationService used when FGA_ENABLED=false (CI, tests,
// local runs without an OpenFGA server). Every check denies; writes are no-ops.
// This keeps the app bootable without OpenFGA while never silently granting
// access — a disabled authz engine must fail closed, not open.

import { logger } from "../../utils/logger";
import {
    AuthorizationService,
    CheckRequest,
    ReadRequest,
    TupleKey,
    WriteRequest,
} from "./types";

export class DisabledAuthorizationService implements AuthorizationService {
    constructor() {
        logger.warn(
            "OpenFGA disabled (FGA_ENABLED=false) — authorization denies by default."
        );
    }

    async check(_request: CheckRequest): Promise<boolean> {
        return false;
    }

    async batchCheck(requests: CheckRequest[]): Promise<boolean[]> {
        return requests.map(() => false);
    }

    async write(_request: WriteRequest): Promise<void> {
        // No store to write to; the outbox worker is the real write path.
    }

    async readTuples(_request: ReadRequest): Promise<TupleKey[]> {
        // No store to read: with authz disabled nothing is shared, so the share
        // list is empty rather than a lie about who has access.
        return [];
    }
}
