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

@Entity()
export class Folders {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    // workspaces is Phase 3: nullable, no FK yet.
    @Column({ type: "uuid", nullable: true })
    workspace_id!: string | null;

    @Column({ type: "uuid", nullable: true })
    parent_id!: string | null;

    @ManyToOne(() => Folders, { nullable: true, onDelete: "RESTRICT" })
    @JoinColumn({ name: "parent_id" })
    parent!: Folders | null;

    @Column({ type: "text" })
    name!: string;

    @Column({ type: "uuid" })
    owner_id!: string;

    @CreateDateColumn()
    created_at!: Date;

    @UpdateDateColumn()
    updated_at!: Date;

    @DeleteDateColumn({ nullable: true })
    deleted_at!: Date | null;
}
