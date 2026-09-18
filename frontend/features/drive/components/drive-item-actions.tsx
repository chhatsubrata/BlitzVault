"use client";

import { useState } from "react";
import { FolderInput, MoreVertical, Pencil, Share2, Trash2 } from "lucide-react";

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
import { RenameFolderDialog } from "@/features/drive/components/rename-folder-dialog";
import { MoveFolderDialog } from "@/features/drive/components/move-folder-dialog";
import { ShareDialog } from "@/features/sharing/components/share-dialog";
import { useDeleteFolder } from "@/features/drive/hooks/use-delete-folder";
import type { DriveFolder } from "@/features/drive/types";

type DriveItemActionsProps = {
  folder: DriveFolder;
  parentId?: string;
};

export function DriveItemActions({ folder, parentId }: DriveItemActionsProps) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const remove = useDeleteFolder(parentId);

  // Rename and Move are both writes, so they stand or fall together.
  const canWrite = canDo(folder, "write");

  const confirmDelete = () => {
    remove.mutate(folder.id, { onSuccess: () => setDeleteOpen(false) });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            aria-label={`Actions for ${folder.name}`}
          >
            <MoreVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* Defer to the next tick so the menu fully closes (and restores
              body pointer-events) before the dialog opens — avoids the Radix
              dropdown+dialog lock. */}
          <GatedMenuItem
            allowed={canWrite}
            reason={DENIED_REASON.write}
            onSelect={() => setTimeout(() => setRenameOpen(true), 0)}
          >
            <Pencil />
            Rename
          </GatedMenuItem>
          <GatedMenuItem
            allowed={canWrite}
            reason={DENIED_REASON.write}
            onSelect={() => setTimeout(() => setMoveOpen(true), 0)}
          >
            <FolderInput />
            Move
          </GatedMenuItem>
          <GatedMenuItem
            allowed={canDo(folder, "share")}
            reason={DENIED_REASON.share}
            onSelect={() => setTimeout(() => setShareOpen(true), 0)}
          >
            <Share2 />
            Share
          </GatedMenuItem>
          <GatedMenuItem
            allowed={canDo(folder, "delete")}
            reason={DENIED_REASON.delete}
            variant="destructive"
            onSelect={() => setTimeout(() => setDeleteOpen(true), 0)}
          >
            <Trash2 />
            Delete
          </GatedMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <RenameFolderDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        folder={folder}
        parentId={parentId}
      />

      <MoveFolderDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        folder={folder}
        parentId={parentId}
      />

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        resource={{ kind: "folder", id: folder.id }}
        resourceName={folder.name}
        resourceHref={`/drive/${folder.id}`}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete folder</DialogTitle>
            <DialogDescription>
              Delete &ldquo;{folder.name}&rdquo; and everything inside it? This
              can&rsquo;t be undone from here.
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
