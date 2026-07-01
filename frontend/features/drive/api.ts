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
    TrashList,
    TrashListQuery,
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

export const moveFolder = async (
    id: string,
    parentId: string | null
): Promise<DriveFolder> => {
    const { folder } = await fetcher<{ folder: DriveFolder }>(
        `${API_CONFIG.drive.LIST_FOLDERS}/${id}/move`,
        { method: "PATCH", body: { parentId } }
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

// --- File actions (download / soft-delete / restore) ---

/** Get a short-lived presigned URL to download a file's original bytes. */
export const getFileDownloadUrl = async (id: string): Promise<string> => {
    const { downloadUrl } = await fetcher<{ downloadUrl: string }>(
        `${API_CONFIG.files.LIST}/${id}/download`,
        { method: "GET" }
    );
    return downloadUrl;
};

/**
 * Fetch a file's bytes from its (cross-origin) presigned URL with download
 * progress. Raw XHR — NOT the app fetcher — because the target is the storage
 * provider. `onProgress` only fires when the response is length-computable.
 */
export const downloadBlob = (
    url: string,
    onProgress: (fraction: number) => void
): Promise<Blob> =>
    new Promise<Blob>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", url);
        xhr.responseType = "blob";
        xhr.onprogress = (event) => {
            if (event.lengthComputable) onProgress(event.loaded / event.total);
        };
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(xhr.response as Blob);
            } else {
                reject(
                    new ApiError({
                        status: xhr.status,
                        code: "UPSTREAM",
                        message: `Download failed (${xhr.status}).`,
                    })
                );
            }
        };
        xhr.onerror = () =>
            reject(
                new ApiError({
                    status: 0,
                    code: "NETWORK",
                    message: "Network error during download.",
                })
            );
        xhr.send();
    });

/** Soft-delete a file (recoverable via restore). */
export const deleteFile = async (
    id: string
): Promise<{ id: string; deleted: true }> =>
    fetcher<{ id: string; deleted: true }>(`${API_CONFIG.files.LIST}/${id}`, {
        method: "DELETE",
    });

/** Restore soft-deleted files — one id or many (single + bulk share the route). */
export const restoreFiles = async (
    ids: string[]
): Promise<{ count: number; restored: true }> =>
    fetcher<{ count: number; restored: true }>(API_CONFIG.files.RESTORE, {
        method: "POST",
        body: { ids },
    });

/** List the caller's soft-deleted files (the trash), cursor-paginated. */
export const listTrash = async (
    query: TrashListQuery = {}
): Promise<TrashList> => {
    const params = new URLSearchParams();
    if (query.cursor) params.set("cursor", query.cursor);
    if (query.limit) params.set("limit", String(query.limit));
    const qs = params.toString();

    return fetcher<TrashList>(
        `${API_CONFIG.files.LIST}/trash${qs ? `?${qs}` : ""}`,
        { method: "GET" }
    );
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

// Files above this size upload in chunks; Cloudinary requires each chunk
// (except the last) to be >= 5 MB.
const CHUNK_THRESHOLD = 10 * 1024 * 1024; // 10 MB
const CHUNK_SIZE = 6 * 1024 * 1024; // 6 MB

type ProgressFn = (fraction: number) => void;

/** One XHR request with upload progress. Resolves on 2xx, rejects otherwise. */
const sendWithProgress = (
    method: string,
    url: string,
    headers: Record<string, string>,
    body: XMLHttpRequestBodyInit,
    onProgress: (loaded: number, total: number) => void
): Promise<void> =>
    new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url);
        // Never set Content-Type for multipart — the browser adds the boundary.
        for (const [key, value] of Object.entries(headers)) {
            xhr.setRequestHeader(key, value);
        }
        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) onProgress(event.loaded, event.total);
        };
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
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
        xhr.send(body);
    });

/** Build the Cloudinary signed multipart form (signed fields + a blob). */
const buildUploadForm = (
    fields: Record<string, string>,
    blob: Blob
): FormData => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
        form.append(key, value);
    }
    form.append("file", blob);
    return form;
};

/**
 * Upload bytes to the presigned target with progress. Cross-origin to the
 * storage provider (e.g. Cloudinary), so raw XHR — NOT the app fetcher. Large
 * files go up in chunks (Cloudinary signed POST supports Content-Range +
 * X-Unique-Upload-Id); the signed fields are valid for every chunk.
 */
export const uploadToStorage = async (
    target: UploadInitResult["upload"],
    file: File,
    onProgress: ProgressFn
): Promise<void> => {
    // Plain presigned PUT (future S3/R2): single raw-body request.
    if (target.method !== "POST") {
        await sendWithProgress(
            target.method,
            target.url,
            target.headers ?? {},
            file,
            (loaded, total) => onProgress(loaded / total)
        );
        onProgress(1);
        return;
    }

    const fields = target.fields ?? {};

    // Small files: one signed multipart POST.
    if (file.size <= CHUNK_THRESHOLD) {
        await sendWithProgress(
            "POST",
            target.url,
            target.headers ?? {},
            buildUploadForm(fields, file),
            (loaded, total) => onProgress(loaded / total)
        );
        onProgress(1);
        return;
    }

    // Large files: sequential chunks sharing one upload id.
    const uploadId = crypto.randomUUID();
    const total = file.size;
    for (let start = 0; start < total; start += CHUNK_SIZE) {
        const end = Math.min(start + CHUNK_SIZE, total);
        const completed = start;
        await sendWithProgress(
            "POST",
            target.url,
            {
                ...(target.headers ?? {}),
                "X-Unique-Upload-Id": uploadId,
                "Content-Range": `bytes ${start}-${end - 1}/${total}`,
            },
            buildUploadForm(fields, file.slice(start, end)),
            (loaded) => onProgress((completed + loaded) / total)
        );
    }
    onProgress(1);
};
