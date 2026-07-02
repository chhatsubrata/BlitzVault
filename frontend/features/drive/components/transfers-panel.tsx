"use client";

import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  Upload,
  X,
} from "lucide-react";

import { cn } from "@/lib/cn";
import { useTransfers } from "@/features/drive/hooks/use-transfers";
import {
  transfersStore,
  type TransferEntry,
} from "@/features/drive/transfers-store";

/**
 * Single floating panel for all in-flight transfers (uploads + downloads),
 * fed by the shared transfers store. Self-contained — reads and dismisses from
 * the store, so it can be dropped in once with no props.
 */
export function TransfersPanel() {
  const transfers = useTransfers();

  if (transfers.length === 0) return null;

  return (
    // Live region: completions/failures are announced here (downloads/uploads
    // don't surface via sonner on success, so this is their sole announcer).
    <div
      role="status"
      aria-live="polite"
      aria-label="Transfers"
      className="fixed right-4 bottom-4 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border bg-popover shadow-lg"
    >
      <div className="border-b px-3 py-2 text-sm font-medium text-foreground">
        Transfers
      </div>
      <ul className="max-h-72 divide-y overflow-y-auto">
        {transfers.map((transfer) => {
          const pct = Math.round(transfer.progress * 100);
          return (
            <li
              key={transfer.localId}
              className="flex flex-col gap-1.5 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <StatusIcon transfer={transfer} />
                <span
                  className="min-w-0 flex-1 truncate text-sm text-foreground"
                  title={transfer.name}
                >
                  {transfer.name}
                </span>
                {/* Status not conveyed by color/icon alone. */}
                <span className="sr-only">{statusLabel(transfer)}</span>
                <button
                  type="button"
                  aria-label={`Dismiss ${transfer.name}`}
                  className="rounded-sm text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
                  onClick={() => transfersStore.remove(transfer.localId)}
                >
                  <X className="size-4" />
                </button>
              </div>

              {transfer.status === "active" ? (
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct}
                  aria-label={`${
                    transfer.kind === "download" ? "Downloading" : "Uploading"
                  } ${transfer.name}`}
                  className="h-1.5 w-full overflow-hidden rounded-full bg-accent"
                >
                  <div
                    className="h-full bg-primary transition-[width] duration-150 motion-reduce:transition-none"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              ) : null}

              {transfer.status === "error" ? (
                <p
                  className="truncate text-xs text-destructive"
                  title={transfer.error}
                >
                  {transfer.error ??
                    (transfer.kind === "download"
                      ? "Download failed"
                      : "Upload failed")}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Text equivalent of the color/icon status, for screen readers.
function statusLabel(transfer: TransferEntry): string {
  if (transfer.status === "done") return "Completed";
  if (transfer.status === "error") return "Failed";
  return transfer.kind === "download" ? "Downloading" : "Uploading";
}

function StatusIcon({ transfer }: { transfer: TransferEntry }) {
  if (transfer.status === "done") {
    return (
      <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden />
    );
  }
  if (transfer.status === "error") {
    return (
      <AlertCircle className="size-4 shrink-0 text-destructive" aria-hidden />
    );
  }
  // Active: a spinner overlaying a directional glyph reads as busy while still
  // telling upload from download apart.
  const KindIcon = transfer.kind === "download" ? Download : Upload;
  return (
    <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
      <Loader2
        className={cn(
          "absolute size-4 animate-spin text-muted-foreground/40 motion-reduce:animate-none"
        )}
        aria-hidden
      />
      <KindIcon className="size-2.5 text-muted-foreground" aria-hidden />
    </span>
  );
}
