const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL?.trim() || "http://localhost:5001";

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
}