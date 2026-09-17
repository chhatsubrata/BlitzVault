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

    // Clerk's `imageUrl`, stored only when `hasImage` is true: Clerk returns a
    // generated placeholder for accounts without a photo, and the UI prefers
    // its own initials avatar to that.
    @Column({ type: "text", nullable: true })
    avatar_url!: string | null;

    @CreateDateColumn()
    created_at!: Date;

    @UpdateDateColumn()
    updated_at!: Date;
}