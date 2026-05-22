import { buildApiUrl } from "@/lib/api-config";
import { ApiError, codeFromStatus } from "@/lib/api-error";
import type {
  ApiErrorResponse,
  ApiSuccessResponse,
  LegacyApiResponse,
} from "@/lib/types/api-envelope";

export type FetcherMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type FetcherOptions = {
  method?: FetcherMethod;
  body?: unknown;
  token?: string | null;
  headers?: Record<string, string>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isApiErrorResponse = (value: unknown): value is ApiErrorResponse => {
  if (!isRecord(value) || !isRecord(value.error)) {
    return false;
  }

  const { error } = value;
  return typeof error.code === "string" && typeof error.message === "string";
};

const isLegacyApiResponse = (value: unknown): value is LegacyApiResponse<unknown> => {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.success === "boolean" && typeof value.message === "string";
};

const isApiSuccessResponse = <T>(value: unknown): value is ApiSuccessResponse<T> =>
  isRecord(value) && "data" in value;

const parseErrorDetails = (
  details: unknown
): Array<{ path: string; issue: string }> | undefined => {
  if (!Array.isArray(details)) {
    return undefined;
  }

  const parsed = details.filter(
    (item): item is { path: string; issue: string } =>
      isRecord(item) &&
      typeof item.path === "string" &&
      typeof item.issue === "string"
  );

  return parsed.length > 0 ? parsed : undefined;
};

const throwApiErrorFromBody = (status: number, body: unknown): never => {
  if (isApiErrorResponse(body)) {
    throw new ApiError({
      status,
      code: body.error.code,
      message: body.error.message,
      requestId: body.error.requestId,
      details: parseErrorDetails(body.error.details),
    });
  }

  if (isLegacyApiResponse(body) && !body.success) {
    throw new ApiError({
      status,
      code: "LEGACY",
      message: body.message,
      legacyErrors: body.errors,
    });
  }

  const message =
    isRecord(body) && typeof body.message === "string"
      ? body.message
      : `Request failed with status ${status}`;

  throw new ApiError({
    status,
    code: codeFromStatus(status),
    message,
  });
};

const parseSuccessBody = <T>(body: unknown): T => {
  if (isApiSuccessResponse<T>(body)) {
    return body.data;
  }

  if (isLegacyApiResponse(body)) {
    if (!body.success) {
      throw new ApiError({
        status: 200,
        code: "LEGACY",
        message: body.message,
        legacyErrors: body.errors,
      });
    }

    if (body.data !== undefined) {
      return body.data as T;
    }

    return body as T;
  }

  return body as T;
};

export async function fetcher<T>(
  path: string,
  options: FetcherOptions = {}
): Promise<T> {
  const { method = "GET", body, token, headers = {} } = options;
  const requestHeaders: Record<string, string> = {
    Accept: "application/json",
    ...headers,
  };

  if (body !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
  }

  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  let response: Response;

  try {
    response = await fetch(buildApiUrl(path), {
      method,
      headers: requestHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError({
      status: 0,
      code: "NETWORK",
      message: "Unable to reach the API. Check that the backend is running.",
    });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const rawText = await response.text();
  let parsedBody: unknown = null;

  if (rawText.length > 0) {
    try {
      parsedBody = JSON.parse(rawText) as unknown;
    } catch {
      throw new ApiError({
        status: response.status,
        code: "PARSE_ERROR",
        message: "API returned a non-JSON response.",
      });
    }
  }

  if (!response.ok) {
    throwApiErrorFromBody(response.status, parsedBody);
  }

  return parseSuccessBody<T>(parsedBody);
}
