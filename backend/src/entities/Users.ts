import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class Users {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column()
    clerk_user_id!: string;

    @Column({ unique: true })
    email!: string;

    @Column({ unique: true })
    username!: string;

    @Column({ type: "varchar", length: 255, nullable: true })
    password?: string | null;

    @CreateDateColumn()
    created_at!: Date;

    @UpdateDateColumn()
    updated_at!: Date;
}