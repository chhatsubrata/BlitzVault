import { v2 as cloudinary } from "cloudinary";
import {
    PresignedUpload,
    StorageAdapter,
    StorageAdapterError,
    StorageObject,
    UploadInitOptions,
} from "./types";

/** Credentials needed to talk to a Cloudinary account. */
export type CloudinaryConfig = {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
};

// Cloudinary signed uploads stay valid ~1h from their timestamp; surface that
// to callers via PresignedUpload.expiresAt.
const UPLOAD_SIGNATURE_TTL_SECONDS = 60 * 60;

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

/**
 * Cloudinary-backed StorageAdapter. `key` maps to Cloudinary `public_id`.
 * Uploads use a signed multipart POST (api_sign_request) so the browser hits
 * Cloudinary directly; the backend only signs and later verifies.
 */
export class CloudinaryAdapter implements StorageAdapter {
    private readonly cloudName: string;
    private readonly apiKey: string;
    private readonly apiSecret: string;

    constructor(config: CloudinaryConfig) {
        if (!config.cloudName || !config.apiKey || !config.apiSecret) {
            // Fail loud rather than sign requests with undefined creds.
            throw new StorageAdapterError(
                "Cloudinary storage is not configured — set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.",
                500
            );
        }

        this.cloudName = config.cloudName;
        this.apiKey = config.apiKey;
        this.apiSecret = config.apiSecret;

        cloudinary.config({
            cloud_name: this.cloudName,
            api_key: this.apiKey,
            api_secret: this.apiSecret,
            secure: true,
        });
    }

    async createPresignedUpload(options: UploadInitOptions): Promise<PresignedUpload> {
        const timestamp = nowSeconds();
        // Only signed params go into the signature; api_key/file/resource_type do not.
        const paramsToSign: Record<string, string | number> = {
            public_id: options.key,
            timestamp,
        };

        try {
            const signature = cloudinary.utils.api_sign_request(paramsToSign, this.apiSecret);

            return {
                url: `https://api.cloudinary.com/v1_1/${this.cloudName}/auto/upload`,
                method: "POST",
                headers: {},
                fields: {
                    api_key: this.apiKey,
                    timestamp: String(timestamp),
                    signature,
                    public_id: options.key,
                },
                key: options.key,
                expiresAt: (timestamp + UPLOAD_SIGNATURE_TTL_SECONDS) * 1000,
            };
        } catch (error) {
            throw this.normalizeError(error, "Failed to sign Cloudinary upload");
        }
    }

    async completeUpload(key: string): Promise<StorageObject> {
        try {
            // Verify the object actually landed and read authoritative metadata.
            const resource = await cloudinary.api.resource(key, { resource_type: "auto" });

            return {
                key,
                sizeBytes: Number(resource.bytes ?? 0),
                contentType: this.resolveContentType(resource),
                etag: resource.etag,
            };
        } catch (error) {
            if (this.isNotFound(error)) {
                throw new StorageAdapterError(`Uploaded object not found: ${key}`, 404);
            }
            throw this.normalizeError(error, "Failed to verify Cloudinary upload");
        }
    }

    async getPresignedDownload(key: string, expiresInSeconds: number): Promise<string> {
        try {
            // Time-limited, signed download of the original asset.
            return cloudinary.utils.private_download_url(key, this.extractFormat(key), {
                resource_type: "auto",
                expires_at: nowSeconds() + expiresInSeconds,
            });
        } catch (error) {
            throw this.normalizeError(error, "Failed to build Cloudinary download URL");
        }
    }

    async deleteObject(key: string): Promise<void> {
        try {
            const result = await cloudinary.uploader.destroy(key, { resource_type: "auto" });

            // Cloudinary returns { result: "ok" | "not found" } without throwing.
            if (result?.result !== "ok" && result?.result !== "not found") {
                throw new StorageAdapterError(
                    `Cloudinary delete failed for ${key}: ${result?.result ?? "unknown"}`,
                    502
                );
            }
        } catch (error) {
            throw this.normalizeError(error, "Failed to delete Cloudinary object");
        }
    }

    private resolveContentType(resource: { resource_type?: string; format?: string }): string {
        // Cloudinary exposes resource_type + format, not a full MIME type.
        if (resource.resource_type && resource.format) {
            return `${resource.resource_type}/${resource.format}`;
        }
        return "application/octet-stream";
    }

    private extractFormat(key: string): string {
        const lastSegment = key.split("/").pop() ?? "";
        const dotIndex = lastSegment.lastIndexOf(".");
        return dotIndex > 0 ? lastSegment.slice(dotIndex + 1) : "";
    }

    private isNotFound(error: unknown): boolean {
        const status = (error as { http_code?: number; error?: { http_code?: number } })?.http_code
            ?? (error as { error?: { http_code?: number } })?.error?.http_code;
        return status === 404;
    }

    private normalizeError(error: unknown, fallback: string): StorageAdapterError {
        if (error instanceof StorageAdapterError) {
            return error;
        }

        const status = (error as { http_code?: number; error?: { http_code?: number } })?.http_code
            ?? (error as { error?: { http_code?: number } })?.error?.http_code
            ?? 502;
        const message = (error as { message?: string; error?: { message?: string } })?.message
            ?? (error as { error?: { message?: string } })?.error?.message
            ?? fallback;

        // Never surface signatures/secrets — message is Cloudinary's own text.
        return new StorageAdapterError(message, status);
    }
}
