import { fetcher } from "@/lib/fetcher";
import { ApiError } from "@/lib/api-error";
import { API_CONFIG } from "@/lib/config";
import type {
    DriveFile,
    DriveList,
    FolderCreateInput,
    DriveFolder,
    FolderCrumb,
    FolderListQuery,
    FileUploadInitInput,
    UploadInitResult,
} from "@/features/drive/types";

/**
 * Drive API wrappers for the Phase 1 folder endpoints (frozen contract).
 * The fetcher unwraps the `{ data }` envelope; folder writes return
 * `{ data: { folder } }`, so we read `.folder` here. Delete returns
 * `{ data: { id, deleted } }`; path returns `{ data: { path } }`.
 */

export const listDrive = async (
    query: Partial<FolderListQuery> = {}
): Promise<DriveList> => {
    const params = new URLSearchParams();
    if (query.parentId) params.set("parentId", query.parentId);
    if (query.cursor) params.set("cursor", query.cursor);
    if (query.limit) params.set("limit", String(query.limit));
    const qs = params.toString();

    return fetcher<DriveList>(
        `${API_CONFIG.drive.LIST_FOLDERS}${qs ? `?${qs}` : ""}`,
        {
            method: "GET",
        }
    );
};

export const createFolder = async (
    input: FolderCreateInput
): Promise<DriveFolder> => {
    const { folder } = await fetcher<{ folder: DriveFolder }>(
        API_CONFIG.drive.CREATE_FOLDER,
        { method: "POST", body: input }
    );
    return folder;
};

export const renameFolder = async (
    id: string,
    name: string
): Promise<DriveFolder> => {
    const { folder } = await fetcher<{ folder: DriveFolder }>(
        `${API_CONFIG.drive.LIST_FOLDERS}/${id}`,
        { method: "PATCH", body: { name } }
    );
    return folder;
};

export const deleteFolder = async (
    id: string
): Promise<{ id: string; deleted: true }> =>
    fetcher<{ id: string; deleted: true }>(
        `${API_CONFIG.drive.LIST_FOLDERS}/${id}`,
        { method: "DELETE" }
    );

export const getFolderPath = async (id: string): Promise<FolderCrumb[]> => {
    const { path } = await fetcher<{ path: FolderCrumb[] }>(
        `${API_CONFIG.drive.LIST_FOLDERS}/${id}/path`,
        { method: "GET" }
    );
    return path;
};

// --- File upload (init -> direct-to-storage -> complete) ---

/**
 * Reserve a file + get a presigned upload target. A fresh Idempotency-Key per
 * attempt keeps retries from creating duplicate rows.
 */
export const initUpload = async (
    input: FileUploadInitInput
): Promise<UploadInitResult> =>
    fetcher<UploadInitResult>(API_CONFIG.files.UPLOAD_INIT, {
        method: "POST",
        body: input,
        headers: { "Idempotency-Key": crypto.randomUUID() },
    });

/** Finalize an upload once the bytes are in storage; returns the ready file. */
export const completeUpload = async (fileId: string): Promise<DriveFile> => {
    const { file } = await fetcher<{ file: DriveFile }>(
        API_CONFIG.files.UPLOAD_COMPLETE,
        { method: "POST", body: { fileId } }
    );
    return file;
};

/**
 * PUT/POST the raw bytes to the presigned target with progress. This is a
 * cross-origin upload to the storage provider (e.g. Cloudinary), so it uses a
 * raw XHR — NOT the app fetcher (no auth header, multipart, upload progress).
 */
export const uploadToStorage = (
    target: UploadInitResult["upload"],
    file: File,
    onProgress: (fraction: number) => void
): Promise<void> =>
    new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(target.method, target.url);

        // Provider headers (usually empty for Cloudinary). Never set
        // Content-Type for multipart — the browser adds the boundary.
        for (const [key, value] of Object.entries(target.headers ?? {})) {
            xhr.setRequestHeader(key, value);
        }

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                onProgress(event.loaded / event.total);
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                onProgress(1);
                resolve();
            } else {
                reject(
                    new ApiError({
                        status: xhr.status,
                        code: "UPSTREAM",
                        message: `Storage upload failed (${xhr.status}).`,
                    })
                );
            }
        };
        xhr.onerror = () =>
            reject(
                new ApiError({
                    status: 0,
                    code: "NETWORK",
                    message: "Network error during upload.",
                })
            );

        if (target.method === "POST") {
            // Signed multipart POST (Cloudinary): all signed fields + the binary.
            const form = new FormData();
            for (const [key, value] of Object.entries(target.fields ?? {})) {
                form.append(key, value);
            }
            form.append("file", file);
            xhr.send(form);
        } else {
            // Plain presigned PUT (S3/R2-style): raw body.
            xhr.send(file);
        }
    });
