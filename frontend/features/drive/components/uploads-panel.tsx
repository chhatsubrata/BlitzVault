"use client";

import { CheckCircle2, Loader2, X, AlertCircle } from "lucide-react";

import { cn } from "@/lib/cn";
import type { UploadEntry } from "@/features/drive/hooks/use-file-uploads";

type UploadsPanelProps = {
  uploads: UploadEntry[];
  onDismiss: (localId: string) => void;
};

export function UploadsPanel({ uploads, onDismiss }: UploadsPanelProps) {
  if (uploads.length === 0) return null;

  return (
    <div className="fixed right-4 bottom-4 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border bg-popover shadow-lg">
      <div className="border-b px-3 py-2 text-sm font-medium text-foreground">
        Uploads
      </div>
      <ul className="max-h-72 divide-y overflow-y-auto">
        {uploads.map((upload) => (
          <li key={upload.localId} className="flex flex-col gap-1.5 px-3 py-2">
            <div className="flex items-center gap-2">
              <StatusIcon status={upload.status} />
              <span
                className="min-w-0 flex-1 truncate text-sm text-foreground"
                title={upload.name}
              >
                {upload.name}
              </span>
              <button
                type="button"
                aria-label={`Dismiss ${upload.name}`}
                className="rounded-sm text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => onDismiss(upload.localId)}
              >
                <X className="size-4" />
              </button>
            </div>

            {upload.status === "uploading" ? (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-accent">
                <div
                  className="h-full bg-primary transition-[width] duration-150"
                  style={{ width: `${Math.round(upload.progress * 100)}%` }}
                />
              </div>
            ) : null}

            {upload.status === "error" ? (
              <p className="truncate text-xs text-destructive" title={upload.error}>
                {upload.error ?? "Upload failed"}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusIcon({ status }: { status: UploadEntry["status"] }) {
  if (status === "done") {
    return <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden />;
  }
  if (status === "error") {
    return <AlertCircle className="size-4 shrink-0 text-destructive" aria-hidden />;
  }
  return (
    <Loader2
      className={cn("size-4 shrink-0 animate-spin text-muted-foreground")}
      aria-hidden
    />
  );
}
