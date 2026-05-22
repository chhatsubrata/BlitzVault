const DEFAULT_BACKEND_BASE_URL = "http://localhost:5001";
const API_VERSION_PREFIX = "/api/v1";

export const getApiBaseUrl = (): string => {
  const configured = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
  return configured || DEFAULT_BACKEND_BASE_URL;
};

const normalizeApiPath = (path: string): string => {
  const trimmed = path.trim();
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;

  if (withLeadingSlash.startsWith(API_VERSION_PREFIX)) {
    return withLeadingSlash;
  }

  return `${API_VERSION_PREFIX}${withLeadingSlash}`;
};

export const buildApiUrl = (path: string): string => {
  const base = getApiBaseUrl().replace(/\/$/, "");
  return `${base}${normalizeApiPath(path)}`;
};
