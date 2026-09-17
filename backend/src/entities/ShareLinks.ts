import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

export type ShareLinkResourceType = "file" | "folder";

/**
 * Anyone-with-the-link sharing (Week 3 Thu). The row is the *resolution* side of
 * a public link; the grant itself still lives only in OpenFGA as
 * `public_link:<id>#accessor -> viewer` on the resource.
 *
 * The row exists because OpenFGA cannot answer "which link is this token?" —
 * `readTuples` needs an object, and there is nowhere in the store to hang
 * `expires_at` / `revoked_at` / `created_by`. `id` doubles as the FGA object id,
 * so `public_link:<this.id>` is the object the tuples reference.
 *
 * The token is stored in plaintext because `SharedWith.publicLink.token` is a
 * frozen response field (shared/openapi/document.ts) returned on every
 * `GET /:id/shares` for the copy-link affordance — the server has to reproduce
 * it on read. Hashing needs a "shown once" UX decision first; see the follow-up
 * ADR. Mitigations: 256-bit tokens, `strict` rate limit on resolve, never logged.
 *
 * Mirrors migration 0007 exactly — synchronize is off outside dev.
 */
@Entity({ name: "share_links" })
export class ShareLinks {
    // Also the FGA object id: `public_link:${id}`.
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column({ type: "text" })
    resource_type!: ShareLinkResourceType;

    @Column({ type: "uuid" })
    resource_id!: string;

    // 43-char base64url of 32 random bytes. Unique; never logged.
    @Column({ type: "text", unique: true })
    token!: string;

    // Only `viewer` is mintable today — an editable public link needs the
    // password/expiry controls that are still unspecced.
    @Column({ type: "text", default: "viewer" })
    permission!: "viewer";

    // Reserved for the password-protected link (docs/database-design.md); no
    // request field sets it yet, and resolve ignores a null.
    @Column({ type: "text", nullable: true })
    password_hash!: string | null;

    // Null means "never expires". Honoured by resolve when set.
    @Column({ type: "timestamp", nullable: true })
    expires_at!: Date | null;

    @Column({ type: "uuid" })
    created_by!: string;

    // Revocation is a tombstone, not a delete: the row is what proves the token
    // was ours, and the partial unique index frees the resource for a new link.
    @Column({ type: "timestamp", nullable: true })
    revoked_at!: Date | null;

    @CreateDateColumn()
    created_at!: Date;
}
