"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RouteError } from "@/components/route-error";
import { DriveBreadcrumbs } from "@/features/drive/components/drive-breadcrumbs";
import { DriveEmptyState } from "@/features/drive/components/drive-empty-state";
import { DriveGrid } from "@/features/drive/components/drive-grid";
import { DriveGridSkeleton } from "@/features/drive/components/drive-grid-skeleton";
import { CreateFolderDialog } from "@/features/drive/components/create-folder-dialog";
import { UploadButton } from "@/features/drive/components/upload-button";
import { UploadsPanel } from "@/features/drive/components/uploads-panel";
import { useDriveList } from "@/features/drive/hooks/use-drive-list";
import { useFileUploads } from "@/features/drive/hooks/use-file-uploads";

type DriveViewProps = {
  // Folder being viewed (undefined = drive root).
  folderId?: string;
};

export function DriveView({ folderId }: DriveViewProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const { data, isLoading, isError, error, refetch } = useDriveList(folderId);
  const { uploads, startUploads, dismiss } = useFileUploads(folderId);

  const isEmpty =
    !isLoading && data?.folders.length === 0 && data?.files.length === 0;

  const openFolder = (id: string) => router.push(`/drive/${id}`);

  return (
    <section className="flex h-full flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <DriveBreadcrumbs folderId={folderId} />
        <div className="flex items-center gap-2">
          <UploadButton folderId={folderId} onPick={startUploads} />
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <FolderPlus aria-hidden />
            Create folder
          </Button>
        </div>
      </header>

      {isLoading ? (
        <DriveGridSkeleton />
      ) : isError ? (
        // react-query errors don't reach the route error.tsx boundary, so the
        // list owns its own retryable error state.
        <RouteError
          error={error as Error}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : isEmpty ? (
        <div className="flex-1">
          <DriveEmptyState onCreateFolder={() => setCreateOpen(true)} />
        </div>
      ) : (
        <DriveGrid
          folders={data?.folders ?? []}
          files={data?.files ?? []}
          parentId={folderId}
          onOpenFolder={openFolder}
        />
      )}

      <CreateFolderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        parentId={folderId}
      />

      <UploadsPanel uploads={uploads} onDismiss={dismiss} />
    </section>
  );
}
