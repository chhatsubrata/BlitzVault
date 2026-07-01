"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  completeUpload,
  initUpload,
  uploadToStorage,
} from "@/features/drive/api";
import { driveKeys } from "@/features/drive/keys";
import { transfersStore } from "@/features/drive/transfers-store";
import type { DriveFile, DriveList } from "@/features/drive/types";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

const DONE_DISMISS_MS = 2_500;

/**
 * Drives file uploads for the current folder: init -> direct-to-storage (with
 * progress) -> complete. Progress is tracked in the shared transfers store (same
 * TransfersPanel as downloads); optimistically shows a pending row in the grid
 * and reconciles with the server on completion.
 */
export function useFileUploads(folderId?: string) {
  const queryClient = useQueryClient();

  const listKey = driveKeys.list(folderId);

  const removeOptimisticFile = useCallback(
    (fileId: string) => {
      queryClient.setQueryData<DriveList>(listKey, (old) =>
        old
          ? { ...old, files: old.files.filter((f) => f.id !== fileId) }
          : old
      );
    },
    [queryClient, listKey]
  );

  const uploadOne = useCallback(
    async (file: File, localId: string): Promise<boolean> => {
      if (!folderId) return false;
      let fileId: string | undefined;

      try {
        const { fileId: id, upload } = await initUpload({
          folderId,
          name: file.name,
          sizeBytes: file.size,
          mime: file.type || "application/octet-stream",
        });
        fileId = id;

        // Optimistic pending row in the grid.
        const now = new Date().toISOString();
        const optimistic: DriveFile = {
          id,
          name: file.name,
          folderId,
          sizeBytes: String(file.size),
          mime: file.type || "application/octet-stream",
          status: "pending",
          createdAt: now,
          updatedAt: now,
        };
        queryClient.setQueryData<DriveList>(listKey, (old) =>
          old
            ? { ...old, files: [...old.files, optimistic] }
            : { folders: [], files: [optimistic], nextCursor: null }
        );

        await uploadToStorage(upload, file, (fraction) =>
          transfersStore.patch(localId, { progress: fraction })
        );

        await completeUpload(id);
        transfersStore.patch(localId, { status: "done", progress: 1 });
        // Let the server's ready row (with real size) replace the optimistic one.
        void queryClient.invalidateQueries({ queryKey: listKey });
        setTimeout(() => transfersStore.remove(localId), DONE_DISMISS_MS);
        return true;
      } catch (error) {
        if (fileId) removeOptimisticFile(fileId);
        const message =
          error instanceof Error ? error.message : "Upload failed.";
        transfersStore.patch(localId, { status: "error", error: message });
        showErrorToast(error);
        return false;
      }
    },
    [folderId, queryClient, listKey, removeOptimisticFile]
  );

  const startUploads = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0 || !folderId) return;

      const localIds = list.map(
        // Index keeps ids unique within a single multi-file pick.
        (_file, index) => `${crypto.randomUUID()}-${index}`
      );
      list.forEach((file, index) => {
        transfersStore.add({
          localId: localIds[index],
          name: file.name,
          kind: "upload",
          progress: 0,
          status: "active",
        });
      });

      void Promise.all(
        list.map((file, index) => uploadOne(file, localIds[index]))
      ).then((results) => {
        const ok = results.filter(Boolean).length;
        if (ok > 0) {
          showSuccessToast(
            ok === 1 ? "File uploaded" : `${ok} files uploaded`
          );
        }
      });
    },
    [folderId, uploadOne]
  );

  return { startUploads };
}
