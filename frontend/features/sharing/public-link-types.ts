import type { DriveFile, DriveFolder } from "@/features/drive/types";
import type {
    ShareResourceKind,
    SharePublicLinkRole,
} from "@/features/sharing/types";

/**
 * `GET /api/v1/links/:token` — the unauthenticated resolve.
 *
 * Kept out of features/sharing/types.ts on purpose: this payload embeds the
 * drive types, and drive/types.ts imports AccessRole/SharePermissions from
 * sharing/types.ts. Parking it in a leaf module keeps that edge one-way.
 *
 * `file` and `folder` are discriminated by `kind`, not by a union, because that
 * is how the server sends it (backend/src/features/sharing/links.service.ts).
 */
export type PublicLinkResolution = {
    /** Always "viewer" — the model defines no editor link. */
    role: SharePublicLinkRole;
    kind: ShareResourceKind;
    file?: DriveFile;
    folder?: DriveFolder;
    /** Presigned and short-lived (300s). Files only. */
    downloadUrl?: string;
};
