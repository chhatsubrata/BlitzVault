const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL?.trim() || "http://localhost:5001";

// Route paths only. Base URL + /api/v1 prefix are owned by lib/api-config.ts
// (buildApiUrl), which the fetcher applies — do not prepend BASE_URL here.
export const API_CONFIG = {
    BASE_URL: API_BASE_URL,
    auth: {
        SYNC: "/auth/sync",
    },
    users: {
        // Member-picker typeahead (target envelope, unlike the other /users routes).
        SEARCH: "/users/search",
    },
    drive: {
        LIST_FOLDERS: "/folders",
        CREATE_FOLDER: "/folders",
    },
    links: {
        // Public-link resolution. The only unauthenticated route in the API.
        RESOLVE: "/links",
    },
    files: {
        LIST: "/files",
        RESTORE: "/files/restore",
        UPLOAD_INIT: "/files/upload/init",
        UPLOAD_COMPLETE: "/files/upload/complete",
    },
}