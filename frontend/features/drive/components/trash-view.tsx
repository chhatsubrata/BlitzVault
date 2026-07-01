"use client";

import { useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RouteError } from "@/components/route-error";
import { useTrashList } from "@/features/drive/hooks/use-trash-list";
import { useRestoreFiles } from "@/features/drive/hooks/use-restore-files";
import type { DriveFile } from "@/features/drive/types";

function TrashSkeleton() {
  return (
    <ul className="flex flex-col gap-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 rounded-md border p-3">
          <Skeleton className="size-4 rounded" />
          <Skeleton className="size-9 rounded" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </li>
      ))}
    </ul>
  );
}

function TrashEmpty() {
  return (
    <section className="flex h-full flex-1 flex-col items-center justify-center gap-3 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-accent">
        <Trash2 className="size-6 text-muted-foreground" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold text-foreground">Trash is empty</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Deleted files show up here. Restore them to put them back in their
        folder.
      </p>
    </section>
  );
}

function TrashRow({
  file,
  selected,
  onToggle,
  onRestore,
  disabled,
}: {
  file: DriveFile;
  selected: boolean;
  onToggle: (id: string) => void;
  onRestore: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <li className="flex items-center gap-3 rounded-md border p-3">
      <input
        type="checkbox"
        className="size-4 accent-primary"
        checked={selected}
        onChange={() => onToggle(file.id)}
        aria-label={`Select ${file.name}`}
      />
      {file.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={file.thumbnailUrl}
          alt=""
          className="size-9 rounded object-cover"
        />
      ) : (
        <div className="flex size-9 items-center justify-center rounded bg-accent text-muted-foreground">
          <Trash2 className="size-4" aria-hidden />
        </div>
      )}
      <span className="flex-1 truncate text-sm text-foreground">{file.name}</span>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => onRestore(file.id)}
      >
        <RotateCcw aria-hidden />
        Restore
      </Button>
    </li>
  );
}

export function TrashView() {
  const { data, isLoading, isError, error, refetch } = useTrashList();
  const restore = useRestoreFiles();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const files = data?.files ?? [];
  const isEmpty = !isLoading && files.length === 0;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const clearSelection = () => setSelected(new Set());

  const restoreIds = (ids: string[]) => {
    if (ids.length === 0) return;
    restore.mutate(ids, { onSuccess: clearSelection });
  };

  const allSelected = files.length > 0 && selected.size === files.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(files.map((f) => f.id)));

  return (
    <section className="flex h-full flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">Trash</h1>
        {files.length > 0 ? (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={toggleAll}>
              {allSelected ? "Clear all" : "Select all"}
            </Button>
            <Button
              size="sm"
              disabled={selected.size === 0 || restore.isPending}
              onClick={() => restoreIds([...selected])}
            >
              <RotateCcw aria-hidden />
              {restore.isPending
                ? "Restoring…"
                : `Restore${selected.size ? ` (${selected.size})` : ""}`}
            </Button>
          </div>
        ) : null}
      </header>

      {isLoading ? (
        <TrashSkeleton />
      ) : isError ? (
        <RouteError
          error={error as Error}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : isEmpty ? (
        <TrashEmpty />
      ) : (
        <ul className="flex flex-col gap-2">
          {files.map((file) => (
            <TrashRow
              key={file.id}
              file={file}
              selected={selected.has(file.id)}
              onToggle={toggle}
              onRestore={(id) => restoreIds([id])}
              disabled={restore.isPending}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
