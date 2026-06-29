// Storage abstraction for the Phase 1 upload pipeline. Provider-agnostic
// contract: concrete adapters (Cloudinary now; S3/R2 later "based on usage")
// implement this so file services depend on the contract, not a provider.
//
// Mirrors the service style of clerk.service.ts (named exports + error class).

/** Options for initializing a presigned upload. */
export type UploadInitOptions = {
    /** Object key / path within the store (e.g. `users/<id>/<fileId>`). */
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
    /**
     * Multipart form fields the client must send with the upload (e.g. Cloudinary
     * signed POST: api_key, timestamp, signature, public_id). Empty for plain
     * presigned-PUT providers (future S3/R2).
     */
    fields?: Record<string, string>;
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
 * Provider-agnostic storage contract. Concrete adapters (Cloudinary/S3/R2)
 * implement this; services depend only on the interface.
 */
export interface StorageAdapter {
    /** Create a presigned target for a new upload. */
    createPresignedUpload(options: UploadInitOptions): Promise<PresignedUpload>;
    /**
     * Finalize an upload (verify existence) and return object metadata. `mime`
     * lets the adapter resolve the provider resource type without probing.
     */
    completeUpload(key: string, mime?: string): Promise<StorageObject>;
    /** Presigned download URL valid for `expiresInSeconds`. */
    getPresignedDownload(key: string, expiresInSeconds: number): Promise<string>;
    /** Remove an object (hard delete in storage). */
    deleteObject(key: string): Promise<void>;
    /**
     * Derived thumbnail URL for a previewable object (e.g. a Cloudinary
     * transform). `mime` lets the adapter special-case formats like PDF.
     * Pure URL build, no I/O. Returns null when the provider can't derive one.
     */
    getThumbnailUrl(key: string, mime?: string): string | null;
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
