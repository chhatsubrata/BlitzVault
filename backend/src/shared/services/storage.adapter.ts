// Storage abstraction for the Phase 1 upload pipeline. INTERFACE ONLY (Week 1
// Dev1 Fri) — no S3/R2/MinIO implementation yet. Week 2 adds a concrete adapter
// behind createStorageAdapter() selected via env. Keeping this decoupled lets
// file services depend on the contract, not a specific provider.
//
// Mirrors the service style of clerk.service.ts (named exports + error class).

/** Options for initializing a presigned upload. */
export type UploadInitOptions = {
    /** Object key / path within the bucket (e.g. `users/<id>/<fileId>`). */
    key: string;
    /** Declared content length in bytes. */
    sizeBytes: number;
    /** MIME type of the object. */
    contentType: string;
    /** Optional sha256 (hex) for integrity verification on complete. */
    checksumSha256?: string;
};

/** A presigned target the client uploads to directly. */
export type PresignedUpload = {
    /** Presigned URL the client PUTs/POSTs the bytes to. */
    url: string;
    /** HTTP method the client must use against `url`. */
    method: "PUT" | "POST";
    /** Headers the client must echo on the upload request. */
    headers: Record<string, string>;
    /** Object key the upload will land at. */
    key: string;
    /** Epoch ms after which `url` is no longer valid. */
    expiresAt: number;
};

/** Metadata for a stored object after upload completes. */
export type StorageObject = {
    key: string;
    sizeBytes: number;
    contentType: string;
    etag?: string;
};

/**
 * Provider-agnostic storage contract. Concrete adapters (S3/R2/MinIO) implement
 * this; services depend only on the interface.
 */
export interface StorageAdapter {
    /** Create a presigned target for a new upload. */
    createPresignedUpload(options: UploadInitOptions): Promise<PresignedUpload>;
    /** Finalize an upload (verify existence/checksum) and return object metadata. */
    completeUpload(key: string): Promise<StorageObject>;
    /** Presigned download URL valid for `expiresInSeconds`. */
    getPresignedDownload(key: string, expiresInSeconds: number): Promise<string>;
    /** Remove an object (hard delete in storage). */
    deleteObject(key: string): Promise<void>;
}

/** Normalized storage error (mirrors ClerkServiceError shape). */
export class StorageAdapterError extends Error {
    statusCode: number;

    constructor(message: string, statusCode = 500) {
        super(message);
        this.name = "StorageAdapterError";
        this.statusCode = statusCode;
    }
}

/**
 * Factory placeholder. Week 2 returns a concrete adapter selected via
 * src/shared/config/env.ts (e.g. STORAGE_DRIVER=s3|r2|minio).
 */
export const createStorageAdapter = (): StorageAdapter => {
    throw new StorageAdapterError("StorageAdapter not implemented yet (Week 2).", 501);
};
