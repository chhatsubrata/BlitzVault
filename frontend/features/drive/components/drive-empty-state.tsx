import { FolderPlus } from "lucide-react";

import { Button } from "@/components/ui/button";

type DriveEmptyStateProps = {
  onCreateFolder: () => void;
};

export function DriveEmptyState({ onCreateFolder }: DriveEmptyStateProps) {
  return (
    <section className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-accent">
        <FolderPlus className="size-6 text-muted-foreground" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold text-foreground">No files yet</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Upload files or create a folder to get started.
      </p>
      <Button onClick={onCreateFolder}>
        <FolderPlus aria-hidden />
        Create folder
      </Button>
    </section>
  );
}
