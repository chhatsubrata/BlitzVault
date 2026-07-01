/**
 * Tiny external store for in-flight transfers (uploads + downloads), shared
 * across the tree so any component can start one and the single TransfersPanel
 * renders them all. Read via `useTransfers()` (useSyncExternalStore).
 */
export type TransferKind = "upload" | "download";
export type TransferStatus = "active" | "done" | "error";

export type TransferEntry = {
    localId: string;
    name: string;
    kind: TransferKind;
    // 0..1. Stays 0 for downloads when the server omits Content-Length.
    progress: number;
    status: TransferStatus;
    error?: string;
};

type Listener = () => void;

let entries: TransferEntry[] = [];
const listeners = new Set<Listener>();

const emit = () => {
    for (const listener of listeners) listener();
};

export const transfersStore = {
    subscribe(listener: Listener) {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },
    // Stable reference between mutations — safe for useSyncExternalStore.
    getSnapshot: (): TransferEntry[] => entries,
    add(entry: TransferEntry) {
        entries = [...entries, entry];
        emit();
    },
    patch(localId: string, next: Partial<TransferEntry>) {
        entries = entries.map((entry) =>
            entry.localId === localId ? { ...entry, ...next } : entry
        );
        emit();
    },
    remove(localId: string) {
        entries = entries.filter((entry) => entry.localId !== localId);
        emit();
    },
};
