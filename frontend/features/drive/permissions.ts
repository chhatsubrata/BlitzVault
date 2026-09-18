import type { SharePermissions } from "@/features/sharing/types";

/**
 * What the UI may offer for a drive item.
 *
 * Replaces the Week 3 Monday STATIC_ACCESS_ROLE placeholder: list responses now
 * carry the caller's real `accessRole` and `permissions`, resolved by OpenFGA
 * (backend/src/shared/services/authz/permissions.ts).
 */

export type DriveAction = "read" | "write" | "share" | "delete";

const PERMISSION_KEY: Record<DriveAction, keyof SharePermissions> = {
    read: "canRead",
    write: "canWrite",
    share: "canShare",
    delete: "canDelete",
};

/**
 * Can the caller do `action` to this item?
 *
 * DEFAULTS TO TRUE when `permissions` is absent — the one place in this app
 * that is not deny-by-default, and deliberately so. This gates DISPLAY, never
 * access: every call is authorized server-side and answers 403 regardless of
 * what the menu offered.
 *
 * Items arrive without permissions in two cases, both of them the caller's own:
 * optimistic rows the client just created (a new folder, a fresh upload), and
 * list responses cached before the field shipped. Denying by default would make
 * a folder un-renameable the instant you create it — trading a rare "403 toast
 * on something you could not do anyway" for a common "cannot touch the thing
 * you own". Real authorization lives in OpenFGA, not here.
 */
export const canDo = (
    item: { permissions?: SharePermissions },
    action: DriveAction
): boolean => (item.permissions ? item.permissions[PERMISSION_KEY[action]] : true);

/**
 * Why an action is unavailable. Shown as text in the menu, never conveyed by
 * dimming alone — a disabled item with no reason reads as a bug.
 */
export const DENIED_REASON: Record<DriveAction, string> = {
    read: "No access",
    write: "Needs edit access",
    share: "Needs share access",
    delete: "Needs delete access",
};
