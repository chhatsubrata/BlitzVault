import { env } from "../../config/env";
import { CloudinaryAdapter } from "./cloudinary.adapter";
import { StorageAdapter, StorageAdapterError } from "./types";

/**
 * Returns the concrete StorageAdapter selected by env.STORAGE_DRIVER. Cloudinary
 * is implemented now; s3/r2 are reserved slots added later "based on usage" —
 * a new adapter file behind this same factory, no file-service changes.
 */
export const createStorageAdapter = (): StorageAdapter => {
    switch (env.STORAGE_DRIVER) {
        case "cloudinary":
            return new CloudinaryAdapter({
                cloudName: env.CLOUDINARY_CLOUD_NAME ?? "",
                apiKey: env.CLOUDINARY_API_KEY ?? "",
                apiSecret: env.CLOUDINARY_API_SECRET ?? "",
            });
        case "s3":
        case "r2":
            throw new StorageAdapterError(
                `Storage driver "${env.STORAGE_DRIVER}" not implemented yet — set STORAGE_DRIVER=cloudinary.`,
                501
            );
        default:
            // Exhaustive guard; env enum should make this unreachable.
            throw new StorageAdapterError(
                `Unknown STORAGE_DRIVER: ${String(env.STORAGE_DRIVER)}`,
                500
            );
    }
};
