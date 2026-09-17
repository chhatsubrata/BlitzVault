/**
 * `fga_outbox` writer (Week 3 Wed Dev1) — the write-side twin of `outbox.ts`.
 *
 * Every runtime tuple change goes through here: a resource row and the tuples
 * describing who may touch it are saved in ONE database transaction, and the
 * worker pushes them to OpenFGA afterwards. Never call `authz.write()` from a
 * request path — a dual-write that half-fails leaves a file whose owner cannot
 * open it, with nothing left to replay (docs/backend-guidelines.md → Transactions).
 *
 * Takes an `EntityManager`, never a `DataSource`, precisely so it cannot be
 * called outside a transaction by accident.
 */
import type { EntityManager } from "typeorm";

import { FgaOutbox, FgaOutboxOp } from "../../../entities/FgaOutbox";
import type { TupleKey } from "./types";

export type TupleOp = {
    op: FgaOutboxOp;
    tuple: TupleKey;
};

/** Namespaced tuple subjects/objects. Keeps `user:${id}` out of every caller. */
export const userRef = (userId: string): string => `user:${userId}`;
export const folderRef = (folderId: string): string => `folder:${folderId}`;
export const fileRef = (fileId: string): string => `file:${fileId}`;

/**
 * Queue tuple operations inside the caller's transaction. Rows land as
 * `pending`; `drainOutbox` moves them to OpenFGA.
 */
export const enqueueTuples = async (
    manager: EntityManager,
    ops: TupleOp[]
): Promise<void> => {
    if (ops.length === 0) return;

    await manager.save(
        FgaOutbox,
        ops.map((entry) => ({ op: entry.op, tuple: entry.tuple }))
    );
};

/** Tuples that make a new resource reachable: its owner, and its parent link. */
export const ownershipTuples = ({
    object,
    ownerId,
    parent,
}: {
    object: string;
    ownerId: string;
    parent?: string | null;
}): TupleOp[] => {
    const ops: TupleOp[] = [
        { op: "write", tuple: { user: userRef(ownerId), relation: "owner", object } },
    ];

    // Root-level folders have no parent tuple: `workspace` parents arrive in
    // Phase 3, and inheritance simply has nothing to walk until then.
    if (parent) {
        ops.push({ op: "write", tuple: { user: parent, relation: "parent", object } });
    }

    return ops;
};
