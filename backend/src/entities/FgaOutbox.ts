import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

import type { TupleKey } from "../shared/services/authz/types";

export type FgaOutboxOp = "write" | "delete";
export type FgaOutboxStatus = "pending" | "done" | "failed";

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
}
