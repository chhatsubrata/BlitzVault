"use client";

import { useCallback, useRef } from "react";

import { downloadBlob, getFileDownloadUrl } from "@/features/drive/api";
import { transfersStore } from "@/features/drive/transfers-store";
import { showErrorToast } from "@/lib/toast";

type DownloadArgs = { id: string; name: string };

const DONE_DISMISS_MS = 2_500;

/**
 * Download a file, surfacing progress in the shared TransfersPanel (same UI as
 * uploads) instead of a toast. Navigating to the signed Cloudinary URL just
 * opens the asset inline, so we fetch the bytes into a blob (with progress) and
 * save from a SAME-ORIGIN object URL — which lets the `download` attribute apply
 * the real filename (ignored on cross-origin URLs).
 */
export function useDownloadFile() {
    // Files currently downloading. Re-triggering the same file (double-click on
    // the menu item, or reopening the menu mid-download) would otherwise fetch
    // the bytes again and save a second copy.
    const inFlight = useRef(new Set<string>());

    const start = useCallback(async ({ id, name }: DownloadArgs) => {
        if (inFlight.current.has(id)) {
            return;
        }
        inFlight.current.add(id);

        const localId = `dl-${crypto.randomUUID()}`;
        transfersStore.add({
            localId,
            name,
            kind: "download",
            progress: 0,
            status: "active",
        });

        try {
            const url = await getFileDownloadUrl(id);
            const blob = await downloadBlob(url, (fraction) =>
                transfersStore.patch(localId, { progress: fraction })
            );

            const objectUrl = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = objectUrl;
            anchor.download = name;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            // Revoke after the click has been dispatched.
            URL.revokeObjectURL(objectUrl);

            transfersStore.patch(localId, { status: "done", progress: 1 });
            setTimeout(() => transfersStore.remove(localId), DONE_DISMISS_MS);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Download failed.";
            transfersStore.patch(localId, { status: "error", error: message });
            showErrorToast(error);
        } finally {
            // Released on success and on failure, so a retry is always allowed.
            inFlight.current.delete(id);
        }
    }, []);

    return { start };
}
