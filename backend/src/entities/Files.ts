import {
    Column,
    CreateDateColumn,
    DeleteDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from "typeorm";
import { Folders } from "./Folders";

export type FileStatus =
    | "pending"
    | "scanning"
    | "ready"
    | "infected"
    | "failed";

@Entity()
export class Files {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    // workspaces is Phase 3: nullable, no FK yet.
    @Column({ type: "uuid", nullable: true })
    workspace_id!: string | null;

    @Column({ type: "uuid" })
    folder_id!: string;

    @ManyToOne(() => Folders, { onDelete: "RESTRICT" })
    @JoinColumn({ name: "folder_id" })
    folder!: Folders;

    @Column({ type: "text" })
    name!: string;

    // bigint maps to JS string in TypeORM.
    @Column({ type: "bigint" })
    size_bytes!: string;

    @Column({ type: "text" })
    mime!: string;

    @Column({ type: "text", unique: true })
    storage_key!: string;

    @Column({ type: "text" })
    storage_provider!: string;

    @Column({ type: "bytea", nullable: true })
    checksum_sha256!: Buffer | null;

    @Column({ type: "text", default: "pending" })
    status!: FileStatus;

    @Column({ type: "uuid" })
    owner_id!: string;

    @CreateDateColumn()
    created_at!: Date;

    @UpdateDateColumn()
    updated_at!: Date;

    @DeleteDateColumn({ nullable: true })
    deleted_at!: Date | null;
}
