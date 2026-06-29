"use client";

import { useRef } from "react";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";

type UploadButtonProps = {
  // Files require a folder (backend folder_id is NOT NULL). Disabled at root.
  folderId?: string;
  onPick: (files: FileList) => void;
};

export function UploadButton({ folderId, onPick }: UploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const disabled = !folderId;

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        title={disabled ? "Open a folder to upload files" : undefined}
        onClick={() => inputRef.current?.click()}
      >
        <Upload aria-hidden />
        Upload
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          const { files } = event.target;
          if (files && files.length > 0) onPick(files);
          // Reset so picking the same file again re-triggers onChange.
          event.target.value = "";
        }}
      />
    </>
  );
}
