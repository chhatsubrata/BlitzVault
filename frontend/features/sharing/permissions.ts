import type { AccessRole } from "@/features/sharing/types";

/**
 * Week 3 Monday placeholder for the caller's role on a drive item.
 *
 * Every listing today is owner-scoped SQL (services resolve ownerId from the
 * Clerk id and filter by it), so every item the grid can show IS owned by the
 * caller — "owner" is accurate, not a stand-in.
 *
 * It stays a constant because the role is not derivable from the frozen
 * `permissions` envelope: owner and editor yield identical booleans. Replace
 * with the item's own role once the backend returns an `accessRole` field, and
 * delete this file.
 */
export const STATIC_ACCESS_ROLE: AccessRole = "owner";
