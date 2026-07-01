"use client";

import { useState } from "react";
import { Download, MoreVertical, Trash2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDeleteFile } from "@/features/drive/hooks/use-delete-file";
import { useDownloadFile } from "@/features/drive/hooks/use-download-file";
import type { DriveFile } from "@/features/drive/types";

type FileItemActionsProps = {
  file: DriveFile;
  parentId?: string;
};

export function FileItemActions({ file, parentId }: FileItemActionsProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const remove = useDeleteFile(parentId);
  const download = useDownloadFile();

  // Only a verified upload has bytes to fetch.
  const canDownload = file.status === "ready";

  const confirmDelete = () => {
    remove.mutate(file.id, { onSuccess: () => setDeleteOpen(false) });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            aria-label={`Actions for ${file.name}`}
          >
            <MoreVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={!canDownload}
            onSelect={() => download.start({ id: file.id, name: file.name })}
          >
            <Download />
            Download
          </DropdownMenuItem>
          {/* Defer to the next tick so the menu fully closes (restoring body
              pointer-events) before the dialog opens — avoids the Radix
              dropdown+dialog lock. */}
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setTimeout(() => setDeleteOpen(true), 0)}
          >
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete file</DialogTitle>
            <DialogDescription>
              Delete &ldquo;{file.name}&rdquo;? You can undo this right after,
              or restore it later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending}
              onClick={confirmDelete}
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
