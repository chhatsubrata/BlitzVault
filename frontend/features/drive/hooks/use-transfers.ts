"use client";

import { useSyncExternalStore } from "react";

import { transfersStore } from "@/features/drive/transfers-store";

/** Subscribe to the shared transfers list (uploads + downloads). */
export function useTransfers() {
    return useSyncExternalStore(
        transfersStore.subscribe,
        transfersStore.getSnapshot,
        transfersStore.getSnapshot
    );
}
