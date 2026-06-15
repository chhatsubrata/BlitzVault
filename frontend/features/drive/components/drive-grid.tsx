import { DriveItemCard } from "@/features/drive/components/drive-item-card";
import type { DriveList } from "@/features/drive/types";

const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6";

export function DriveGrid({ folders, files }: DriveList) {
  return (
    <div className={GRID}>
      {folders.map((folder) => (
        <DriveItemCard key={folder.id} kind="folder" item={folder} />
      ))}
      {files.map((file) => (
        <DriveItemCard key={file.id} kind="file" item={file} />
      ))}
    </div>
  );
}
