"use client";

import { useRef, useState, type ReactNode } from "react";
import { Upload } from "lucide-react";

type UploadDropzoneProps = {
  // Files need a folder (backend folder_id is NOT NULL). Root can't accept drops.
  folderId?: string;
  onFiles: (files: FileList) => void;
  children: ReactNode;
};

/**
 * Wraps drive content in a drop target that hands dropped files to the existing
 * upload pipeline. A drag counter avoids the enter/leave flicker as the cursor
 * crosses nested children. At the drive root (no folderId) drops are ignored —
 * the upload button is disabled there for the same reason.
 */
export function UploadDropzone({
  folderId,
  onFiles,
  children,
}: UploadDropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  // Only react to file drags (ignore text/element drags).
  const hasFiles = (event: React.DragEvent) =>
    Array.from(event.dataTransfer.types).includes("Files");

  const reset = () => {
    dragDepth.current = 0;
    setDragging(false);
  };

  const handleDragEnter = (event: React.DragEvent) => {
    if (!folderId || !hasFiles(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };

  const handleDragOver = (event: React.DragEvent) => {
    if (!folderId || !hasFiles(event)) return;
    // Required so the element becomes a valid drop target.
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (event: React.DragEvent) => {
    if (!folderId || !hasFiles(event)) return;
    event.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) reset();
  };

  const handleDrop = (event: React.DragEvent) => {
    if (!folderId || !hasFiles(event)) return;
    event.preventDefault();
    reset();
    const { files } = event.dataTransfer;
    if (files && files.length > 0) onFiles(files);
  };

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}

      {dragging ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/5 backdrop-blur-[1px]">
          <div className="flex flex-col items-center gap-2 text-primary">
            <Upload className="size-8" aria-hidden />
            <p className="text-sm font-medium">Drop files to upload</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
