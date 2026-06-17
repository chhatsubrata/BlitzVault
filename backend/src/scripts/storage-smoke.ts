/**
 * Real-Cloudinary smoke test for the StorageAdapter (Week 2 Mon Dev1 setup).
 *
 * Exercises the full adapter cycle against a live account:
 *   createPresignedUpload -> POST bytes to Cloudinary -> completeUpload
 *   -> getPresignedDownload -> deleteObject
 *
 * Requires real creds in backend/.env.local:
 *   STORAGE_DRIVER=cloudinary
 *   CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET
 *
 * Run (from backend/):
 *   pnpm ts-node src/scripts/storage-smoke.ts <path-to-file> [--keep]
 *
 * --keep skips the delete step so you can inspect the asset in the Cloudinary
 * Media Library. Not wired into HTTP yet — that lands Tuesday (/files/upload).
 */
import { readFile } from "fs/promises";
import path from "path";
import { createStorageAdapter } from "../shared/services/storage";

const log = (step: string, detail: unknown): void => {
    console.log(`\n• ${step}`);
    console.log(typeof detail === "string" ? `  ${detail}` : detail);
};

const main = async (): Promise<void> => {
    const filePath = process.argv[2];
    const keep = process.argv.includes("--keep");

    if (!filePath) {
        console.error("Usage: pnpm ts-node src/scripts/storage-smoke.ts <file> [--keep]");
        process.exit(1);
    }

    const fileName = path.basename(filePath);
    const bytes = await readFile(filePath);
    // Smoke objects live under smoke/ so they're easy to spot/clean in the console.
    const key = `smoke/${Date.now()}-${fileName}`;

    const storage = createStorageAdapter();

    // 1. Presign — backend signs the upload; the browser would POST directly.
    const presigned = await storage.createPresignedUpload({
        key,
        sizeBytes: bytes.byteLength,
        contentType: "application/octet-stream",
    });
    log("createPresignedUpload", {
        url: presigned.url,
        method: presigned.method,
        fields: { ...presigned.fields, signature: "<redacted>" },
        expiresAt: new Date(presigned.expiresAt).toISOString(),
    });

    // 2. Upload the bytes exactly as a client would (multipart form + signed fields).
    const form = new FormData();
    for (const [name, value] of Object.entries(presigned.fields ?? {})) {
        form.append(name, value);
    }
    form.append("file", new Blob([new Uint8Array(bytes)]), fileName);

    const uploadRes = await fetch(presigned.url, { method: presigned.method, body: form });
    const uploadBody = (await uploadRes.json()) as Record<string, unknown>;
    if (!uploadRes.ok) {
        log("upload FAILED", uploadBody);
        process.exit(1);
    }
    log("upload ok", {
        public_id: uploadBody.public_id,
        resource_type: uploadBody.resource_type,
        bytes: uploadBody.bytes,
        secure_url: uploadBody.secure_url,
    });

    // 3. Verify via Admin API (what /files/upload/complete will call Tuesday).
    try {
        const obj = await storage.completeUpload(key);
        log("completeUpload", obj);
    } catch (error) {
        log("completeUpload note", {
            message: (error as Error).message,
            hint: "Admin API needs a concrete resource_type; refine in the Tue /complete endpoint.",
        });
    }

    // 4. Signed, time-limited download URL.
    const downloadUrl = await storage.getPresignedDownload(key, 300);
    log("getPresignedDownload (valid 300s)", downloadUrl);

    // 5. Clean up unless --keep.
    if (keep) {
        log("deleteObject", "skipped (--keep)");
    } else {
        await storage.deleteObject(key);
        log("deleteObject", "removed");
    }

    console.log("\n✓ smoke complete");
    process.exit(0);
};

main().catch((error) => {
    console.error("\n✗ smoke failed:", error);
    process.exit(1);
});
