"use client";

import { useMemo, useRef, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DriveItemCard } from "@/features/drive/components/drive-item-card";
import { DriveItemActions } from "@/features/drive/components/drive-item-actions";
import { FileItemActions } from "@/features/drive/components/file-item-actions";
import {
  useGridKeyboard,
  type GridItem,
} from "@/features/drive/hooks/use-grid-keyboard";
import { useDeleteFile } from "@/features/drive/hooks/use-delete-file";
import { useDeleteFolder } from "@/features/drive/hooks/use-delete-folder";
import { STATIC_ACCESS_ROLE } from "@/features/sharing/permissions";
import type { DriveFile, DriveFolder } from "@/features/drive/types";

const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6";

type DriveGridProps = {
  folders: DriveFolder[];
  files: DriveFile[];
  // Current view, so mutations target the right list cache.
  parentId?: string;
  onOpenFolder: (folderId: string) => void;
};

export function DriveGrid({
  folders,
  files,
  parentId,
  onOpenFolder,
}: DriveGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const deleteFile = useDeleteFile(parentId);
  const deleteFolder = useDeleteFolder(parentId);

  // Folder deletes are irreversible (no restore API), so a keyboard Delete opens
  // one shared confirm dialog owned here. File deletes are optimistic + undo.
  const [pendingFolder, setPendingFolder] = useState<DriveFolder | null>(null);

  // Combined list in render order (folders, then files) — indexes align with
  // the cards below so roving focus maps 1:1.
  const items = useMemo<GridItem[]>(
    () => [
      ...folders.map((f) => ({ id: f.id, kind: "folder" as const })),
      ...files.map((f) => ({ id: f.id, kind: "file" as const })),
    ],
    [folders, files]
  );

  // Folders open. Files do NOT act on activation: downloading a file is a
  // deliberate choice, so it stays behind the explicit Download action in the
  // card menu. The preview pane (Phase 4) is what will fill this in for files.
  const onActivate = (item: GridItem) => {
    if (item.kind === "folder") {
      onOpenFolder(item.id);
    }
  };

  const onTrash = (item: GridItem) => {
    if (item.kind === "file") {
      // Delete/Backspace auto-repeats while held; without this a single long
      // press fires a burst of delete requests for the same file.
      if (deleteFile.isPending) return;
      deleteFile.mutate(item.id); // optimistic + Undo toast (restore API exists)
      return;
    }
    const folder = folders.find((f) => f.id === item.id);
    if (folder) setPendingFolder(folder);
  };

  const { getItemProps } = useGridKeyboard({ items, gridRef, onActivate, onTrash });

  const confirmFolderDelete = () => {
    if (!pendingFolder) return;
    deleteFolder.mutate(pendingFolder.id, {
      onSuccess: () => setPendingFolder(null),
    });
  };

  return (
    <>
      <div className={GRID} ref={gridRef}>
        {folders.map((folder, i) => (
          // Actions live as a SIBLING of the card (not a child): the menu/dialog
          // content is portaled and bubbles through the React tree, so nesting it
          // under the card would fire the card's navigate onClick.
          <div key={folder.id} className="relative">
            <DriveItemCard
              kind="folder"
              item={folder}
              accessRole={STATIC_ACCESS_ROLE}
              onActivate={() => onOpenFolder(folder.id)}
              {...getItemProps(i)}
            />
            <div className="absolute top-2 right-2">
              <DriveItemActions folder={folder} parentId={parentId} />
            </div>
          </div>
        ))}
        {files.map((file, j) => (
          // Actions overlay as a sibling of the card (see folder note above).
          <div key={file.id} className="relative">
            <DriveItemCard
              kind="file"
              item={file}
              accessRole={STATIC_ACCESS_ROLE}
              {...getItemProps(folders.length + j)}
            />
            <div className="absolute top-2 right-2">
              <FileItemActions file={file} parentId={parentId} />
            </div>
          </div>
        ))}
      </div>

      {/* Shared confirm for keyboard-initiated folder deletes. */}
      <Dialog
        open={pendingFolder !== null}
        onOpenChange={(open) => {
          if (!open) setPendingFolder(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete folder</DialogTitle>
            <DialogDescription>
              Delete &ldquo;{pendingFolder?.name}&rdquo; and everything inside
              it? This can&rsquo;t be undone from here.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingFolder(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteFolder.isPending}
              onClick={confirmFolderDelete}
            >
              {deleteFolder.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
