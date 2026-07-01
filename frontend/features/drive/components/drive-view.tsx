"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderPlus, FolderX } from "lucide-react";

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
import { isApiError } from "@/lib/api-error";

type DriveViewProps = {
  // Folder being viewed (undefined = drive root).
  folderId?: string;
};

export function DriveView({ folderId }: DriveViewProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const { data, isLoading, isError, error, refetch } = useDriveList(folderId);
  const { startUploads } = useFileUploads(folderId);
  // The folder-path endpoint is owner-scoped: a 404/403 for a deep-linked
  // folder means it doesn't exist or isn't the caller's.
  const folderPath = useFolderPath(folderId);

  const folderDenied =
    Boolean(folderId) &&
    folderPath.isError &&
    isApiError(folderPath.error) &&
    (folderPath.error.status === 404 || folderPath.error.status === 403);

  const isEmpty =
    !isLoading && data?.folders.length === 0 && data?.files.length === 0;

  const openFolder = (id: string) => router.push(`/drive/${id}`);

  if (folderDenied) {
    return (
      <section className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <FolderX className="size-10 text-muted-foreground" aria-hidden />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">
            Folder not found
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            This folder doesn&rsquo;t exist, or you don&rsquo;t have access to
            it.
          </p>
        </div>
        <Button asChild>
          <Link href="/drive">Back to My Drive</Link>
        </Button>
      </section>
    );
  }

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

      <UploadDropzone folderId={folderId} onFiles={startUploads}>
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
