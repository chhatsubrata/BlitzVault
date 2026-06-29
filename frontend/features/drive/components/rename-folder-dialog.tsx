"use client";

import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRenameFolder } from "@/features/drive/hooks/use-rename-folder";
import { folderRenameSchema, type DriveFolder } from "@/features/drive/types";

type RenameFolderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: DriveFolder;
  // Current view, so the mutation targets the right list cache.
  parentId?: string;
};

export function RenameFolderDialog({
  open,
  onOpenChange,
  folder,
  parentId,
}: RenameFolderDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Mounted only while open, so state resets to the current name each
            time without a setState-in-effect. */}
        {open ? (
          <RenameFolderForm
            folder={folder}
            parentId={parentId}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RenameFolderForm({
  folder,
  parentId,
  onDone,
}: {
  folder: DriveFolder;
  parentId?: string;
  onDone: () => void;
}) {
  const [name, setName] = useState(folder.name);
  const [error, setError] = useState<string>();
  const rename = useRenameFolder(parentId);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = folderRenameSchema.safeParse({ name });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid name");
      return;
    }
    if (parsed.data.name === folder.name) {
      onDone();
      return;
    }

    rename.mutate(
      { id: folder.id, name: parsed.data.name },
      { onSuccess: onDone }
    );
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Rename folder</DialogTitle>
      </DialogHeader>

      <div className="grid gap-2">
        <Label htmlFor="rename-folder-name">Name</Label>
        <Input
          id="rename-folder-name"
          autoFocus
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (error) setError(undefined);
          }}
          aria-invalid={Boolean(error)}
        />
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={rename.isPending}>
          {rename.isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
