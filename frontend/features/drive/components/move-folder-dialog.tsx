"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Folder, Home } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDriveList } from "@/features/drive/hooks/use-drive-list";
import { useMoveFolder } from "@/features/drive/hooks/use-move-folder";
import type { DriveFolder } from "@/features/drive/types";

type MoveFolderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: DriveFolder;
  // Current view, so the mutation targets the right (source) list cache.
  parentId?: string;
};

export function MoveFolderDialog({
  open,
  onOpenChange,
  folder,
  parentId,
}: MoveFolderDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Mounted only while open, so the picker resets to root each time. */}
        {open ? (
          <MoveFolderForm
            folder={folder}
            parentId={parentId}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type Crumb = { id: string; name: string };

function MoveFolderForm({
  folder,
  parentId,
  onDone,
}: {
  folder: DriveFolder;
  parentId?: string;
  onDone: () => void;
}) {
  // Navigation stack into the destination tree; empty = drive root.
  const [stack, setStack] = useState<Crumb[]>([]);
  const destId = stack.length > 0 ? stack[stack.length - 1].id : undefined;

  const { data, isLoading, isError } = useDriveList(destId);
  const move = useMoveFolder(parentId);

  // Can't move a folder into itself; hide it from the destination list.
  const options = (data?.folders ?? []).filter((f) => f.id !== folder.id);

  const targetParentId = destId ?? null;
  // No-op if the destination is where it already lives.
  const isNoop = targetParentId === folder.parentId;

  const handleMove = () => {
    move.mutate(
      { id: folder.id, parentId: targetParentId },
      { onSuccess: onDone }
    );
  };

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Move &ldquo;{folder.name}&rdquo;</DialogTitle>
        <DialogDescription>
          Pick a destination folder, then move it here.
        </DialogDescription>
      </DialogHeader>

      {/* Breadcrumb / up navigation */}
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2"
          disabled={stack.length === 0}
          onClick={() => setStack((s) => s.slice(0, -1))}
        >
          <ChevronLeft className="size-4" />
          Back
        </Button>
        <span className="flex items-center gap-1 truncate">
          <Home className="size-4 shrink-0" />
          {stack.map((c) => (
            <span key={c.id} className="flex items-center gap-1 truncate">
              <ChevronRight className="size-3 shrink-0" />
              <span className="truncate">{c.name}</span>
            </span>
          ))}
        </span>
      </div>

      {/* Destination list */}
      <div className="min-h-40 max-h-64 overflow-auto rounded-md border">
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : isError ? (
          <p className="p-4 text-sm text-destructive">
            Couldn&rsquo;t load folders.
          </p>
        ) : options.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No subfolders here.</p>
        ) : (
          <ul className="divide-y">
            {options.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() =>
                    setStack((s) => [...s, { id: f.id, name: f.name }])
                  }
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Folder className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{f.name}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={move.isPending || isNoop}
          title={isNoop ? "Already in this folder" : undefined}
          onClick={handleMove}
        >
          {move.isPending
            ? "Moving…"
            : `Move to ${stack.length > 0 ? stack[stack.length - 1].name : "Home"}`}
        </Button>
      </DialogFooter>
    </div>
  );
}
