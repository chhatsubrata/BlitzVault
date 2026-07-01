"use client";

import { DriveItemCard } from "@/features/drive/components/drive-item-card";
import { DriveItemActions } from "@/features/drive/components/drive-item-actions";
import { FileItemActions } from "@/features/drive/components/file-item-actions";
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
  return (
    <div className={GRID}>
      {folders.map((folder) => (
        // Actions live as a SIBLING of the card (not a child): the menu/dialog
        // content is portaled and bubbles through the React tree, so nesting it
        // under the card would fire the card's navigate onClick.
        <div key={folder.id} className="relative">
          <DriveItemCard
            kind="folder"
            item={folder}
            onActivate={() => onOpenFolder(folder.id)}
          />
          <div className="absolute top-2 right-2">
            <DriveItemActions folder={folder} parentId={parentId} />
          </div>
        </div>
      ))}
      {files.map((file) => (
        // Actions overlay as a sibling of the card (see folder note above).
        <div key={file.id} className="relative">
          <DriveItemCard kind="file" item={file} />
          <div className="absolute top-2 right-2">
            <FileItemActions file={file} parentId={parentId} />
          </div>
        </div>
      ))}
    </div>
  );
}
