import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

import type { TupleKey } from "../shared/services/authz/types";

export type FgaOutboxOp = "write" | "delete";
/**
 * `failed` is retryable — the drain picks it up again after a backoff.
 * `dead` is not: the row exhausted its attempts and needs a human, because a
 * tuple the database believes in will never reach OpenFGA on its own.
 */
export type FgaOutboxStatus = "pending" | "done" | "failed" | "dead";

/**
 * Transactional outbox for OpenFGA tuple writes. Rows are inserted in the same
 * DB transaction as the resource they describe and drained to OpenFGA by a
 * worker. Mirrors migration 0004 exactly — synchronize is off outside dev.
 */
@Entity({ name: "fga_outbox" })
export class FgaOutbox {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column({ type: "text" })
    op!: FgaOutboxOp;

    // { user, relation, object } — ids already namespaced (user:<id>, file:<id>).
    @Column({ type: "jsonb" })
    tuple!: TupleKey;

    @Column({ type: "text", default: "pending" })
    status!: FgaOutboxStatus;

    @Column({ type: "integer", default: 0 })
    attempts!: number;

    @Column({ type: "text", nullable: true })
    last_error!: string | null;

    @CreateDateColumn()
    created_at!: Date;

    @Column({ type: "timestamp", nullable: true })
    processed_at!: Date | null;

    // Earliest time the drain may retry this row. Null means "immediately",
    // which is every pending row; a failure sets it to an exponential backoff
    // so a hard-down OpenFGA is not hammered once a second.
    @Column({ type: "timestamp", nullable: true })
    next_attempt_at!: Date | null;
}
