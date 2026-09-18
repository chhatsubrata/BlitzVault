"use client";

import { useState } from "react";
import Link from "next/link";
import { FolderPlus, FolderX } from "lucide-react";

import { AccessDenied } from "@/components/access-denied";
import { Button } from "@/components/ui/button";
import { RouteError } from "@/components/route-error";
import { DriveBreadcrumbs } from "@/features/drive/components/drive-breadcrumbs";
import { DriveEmptyState } from "@/features/drive/components/drive-empty-state";
import { DriveGrid } from "@/features/drive/components/drive-grid";
import { DriveGridSkeleton } from "@/features/drive/components/drive-grid-skeleton";
import { CreateFolderDialog } from "@/features/drive/components/create-folder-dialog";
import { UploadButton } from "@/features/drive/components/upload-button";
import { UploadDropzone } from "@/features/drive/components/upload-dropzone";
import { TransfersPanel } from "@/features/drive/components/transfers-panel";
import { useDriveList } from "@/features/drive/hooks/use-drive-list";
import { useFileUploads } from "@/features/drive/hooks/use-file-uploads";
import { useFolderPath } from "@/features/drive/hooks/use-folder-path";
import { useRouteNavigation } from "@/hooks/use-route-navigation";
import { isApiError } from "@/lib/api-error";

type DriveViewProps = {
  // Folder being viewed (undefined = drive root).
  folderId?: string;
};

export function DriveView({ folderId }: DriveViewProps) {
  const { navigate, linkProps } = useRouteNavigation();
  const [createOpen, setCreateOpen] = useState(false);
  const { data, isLoading, isError, error, refetch } = useDriveList(folderId);
  const { startUploads } = useFileUploads(folderId);
  // The folder-path endpoint is owner-scoped: a 404/403 for a deep-linked
  // folder means it doesn't exist or isn't the caller's.
  const folderPath = useFolderPath(folderId);

  // 404 and 403 are answered separately: telling someone their colleague's
  // folder does not exist is a lie, and it sends them looking for a typo
  // instead of asking for access.
  const folderError =
    folderId && folderPath.isError && isApiError(folderPath.error)
      ? folderPath.error
      : null;
  const backToDrive = (
    <Button asChild>
      <Link {...linkProps("/drive")}>Back to My Drive</Link>
    </Button>
  );

  const isEmpty =
    !isLoading && data?.folders.length === 0 && data?.files.length === 0;

  // Guarded: repeat clicks on the same folder don't queue duplicate RSC loads.
  const openFolder = (id: string) => navigate(`/drive/${id}`);

  if (folderError?.status === 404) {
    return (
      <AccessDenied
        icon={FolderX}
        title="Folder not found"
        description="This folder doesn't exist, or it was deleted."
        action={backToDrive}
      />
    );
  }

  if (folderError?.status === 403) {
    return <AccessDenied action={backToDrive} />;
  }

  return (
    <section className="flex h-full flex-col gap-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <DriveBreadcrumbs folderId={folderId} />
        <div className="flex flex-wrap items-center gap-2">
          <UploadButton folderId={folderId} onPick={startUploads} />
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            aria-label="Create folder"
          >
            <FolderPlus aria-hidden />
            <span className="hidden sm:inline">Create folder</span>
          </Button>
        </div>
      </header>

      <UploadDropzone folderId={folderId} onFiles={startUploads}>
        {isLoading ? (
          <DriveGridSkeleton />
        ) : isError ? (
          // react-query errors don't reach the route error.tsx boundary, so the
          // list owns its own retryable error state. A denial gets no retry
          // button — the same call would only be refused again.
          isApiError(error) && error.code === "FORBIDDEN" ? (
            <AccessDenied />
          ) : (
            <RouteError
              error={error as Error}
              onRetry={() => {
                void refetch();
              }}
            />
          )
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
      </UploadDropzone>

      <CreateFolderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        parentId={folderId}
      />

      <TransfersPanel />
    </section>
  );
}
