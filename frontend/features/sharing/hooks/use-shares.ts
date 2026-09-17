import { useQuery } from "@tanstack/react-query";

import { listShares } from "@/features/sharing/api";
import { sharingKeys } from "@/features/sharing/keys";
import type { SharedWith, ShareResourceRef } from "@/features/sharing/types";

/**
 * Who a file or folder is shared with. Served by the mock adapter until the
 * backend share endpoints land (Week 3 Wed).
 *
 * Mounted only while the share dialog is open (the dialog body is gated on
 * `open`), so this never fires once per card across the grid.
 */
export function useShares(resource: ShareResourceRef) {
    return useQuery<SharedWith>({
        queryKey: sharingKeys.shares(resource.kind, resource.id),
        queryFn: () => listShares(resource),
        // Without the endpoints (mock off) this is a permanent 404, and the
        // default 3 retries with backoff would hold "Loading…" for ~4s, which
        // reads as a hang. Fail fast and show the error state. Revisit Wed.
        retry: false,
    });
}
