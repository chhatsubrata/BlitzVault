const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL?.trim() || "http://localhost:5001";

/**
 * Week 3 sharing mock. The backend share endpoints land Wednesday; until then
 * features/sharing reads fixtures instead of calling them.
 *
 * Two-key guard on purpose. Next inlines both values at build time, so in a
 * production build this is statically false and the mock module is dropped
 * from the bundle entirely — a stray env var cannot switch it on. The strict
 * === "true" makes NEXT_PUBLIC_SHARING_MOCK=1 fail closed.
 *
 * Delete with features/sharing/mock/.
 */
export const SHARING_MOCK_ENABLED =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_SHARING_MOCK === "true";

// Route paths only. Base URL + /api/v1 prefix are owned by lib/api-config.ts
// (buildApiUrl), which the fetcher applies — do not prepend BASE_URL here.
export const API_CONFIG = {
    BASE_URL: API_BASE_URL,
    auth: {
        SYNC: "/auth/sync",
    },
    drive: {
        LIST_FOLDERS: "/folders",
        CREATE_FOLDER: "/folders",
    },
    files: {
        LIST: "/files",
        RESTORE: "/files/restore",
        UPLOAD_INIT: "/files/upload/init",
        UPLOAD_COMPLETE: "/files/upload/complete",
    },
}