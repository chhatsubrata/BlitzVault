"use client";

import { useState } from "react";
import { Download, MoreVertical, Share2, Trash2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
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
import { GatedMenuItem } from "@/features/drive/components/gated-menu-item";
import { canDo, DENIED_REASON } from "@/features/drive/permissions";
import { useDeleteFile } from "@/features/drive/hooks/use-delete-file";
import { useDownloadFile } from "@/features/drive/hooks/use-download-file";
import { ShareDialog } from "@/features/sharing/components/share-dialog";
import type { DriveFile } from "@/features/drive/types";

type FileItemActionsProps = {
  file: DriveFile;
  parentId?: string;
};

export function FileItemActions({ file, parentId }: FileItemActionsProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const remove = useDeleteFile(parentId);
  const download = useDownloadFile();

  // Two unrelated reasons a download can be off: no access, or no verified
  // bytes yet. They read very differently to the user, so they are kept apart.
  const canRead = canDo(file, "read");
  const isReady = file.status === "ready";
  const canDownload = canRead && isReady;
  const downloadReason = canRead ? "Still scanning" : DENIED_REASON.read;

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
          <GatedMenuItem
            allowed={canDownload}
            reason={downloadReason}
            onSelect={() => download.start({ id: file.id, name: file.name })}
          >
            <Download />
            Download
          </GatedMenuItem>
          {/* Defer to the next tick so the menu fully closes (restoring body
              pointer-events) before a dialog opens — avoids the Radix
              dropdown+dialog lock. Applies to Share and Delete alike. */}
          <GatedMenuItem
            allowed={canDo(file, "share")}
            reason={DENIED_REASON.share}
            onSelect={() => setTimeout(() => setShareOpen(true), 0)}
          >
            <Share2 />
            Share
          </GatedMenuItem>
          <GatedMenuItem
            allowed={canDo(file, "delete")}
            reason={DENIED_REASON.delete}
            variant="destructive"
            onSelect={() => setTimeout(() => setDeleteOpen(true), 0)}
          >
            <Trash2 />
            Delete
          </GatedMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        resource={{ kind: "file", id: file.id }}
        resourceName={file.name}
        // The file has no page of its own yet: the link opens its folder, and
        // Thursday's preview reads the `file` param.
        resourceHref={`/drive/${file.folderId}?file=${file.id}`}
      />

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
