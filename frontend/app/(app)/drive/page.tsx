"use client";

import { FolderPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { RouteError } from "@/components/route-error";
import { DriveEmptyState } from "@/features/drive/components/drive-empty-state";
import { DriveGrid } from "@/features/drive/components/drive-grid";
import { DriveGridSkeleton } from "@/features/drive/components/drive-grid-skeleton";
import { useDriveList } from "@/features/drive/hooks/use-drive-list";

export default function DrivePage() {
  const { data, isLoading, isError, error, refetch } = useDriveList();

  // Create-folder mutation lands with backend CRUD (Week 2). Stub for now.
  const handleCreateFolder = () => toast.info("Create folder — coming soon");

  const isEmpty =
    !isLoading && data?.folders.length === 0 && data?.files.length === 0;

  return (
    <section className="flex h-full flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">My Drive</h1>
        <Button size="sm" onClick={handleCreateFolder}>
          <FolderPlus aria-hidden />
          Create folder
        </Button>
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
          <DriveEmptyState onCreateFolder={handleCreateFolder} />
        </div>
      ) : (
        <DriveGrid
          folders={data?.folders ?? []}
          files={data?.files ?? []}
          nextCursor={data?.nextCursor ?? null}
        />
      )}
    </section>
  );
}
