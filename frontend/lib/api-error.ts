export type ApiErrorDetail = {
  path: string;
  issue: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly details?: ApiErrorDetail[];
  readonly legacyErrors?: string[];

  constructor(options: {
    status: number;
    code: string;
    message: string;
    requestId?: string;
    details?: ApiErrorDetail[];
    legacyErrors?: string[];
  }) {
    super(options.message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
    this.details = options.details;
    this.legacyErrors = options.legacyErrors;
  }
}

const STATUS_CODE_MAP: Record<number, string> = {
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  422: "QUOTA_EXCEEDED",
  429: "RATE_LIMITED",
};

export const codeFromStatus = (status: number): string => {
  if (STATUS_CODE_MAP[status]) {
    return STATUS_CODE_MAP[status];
  }

  if (status >= 500) {
    return "INTERNAL";
  }

  if (status >= 400) {
    return "VALIDATION";
  }

  return "UNKNOWN";
};

export const isApiError = (error: unknown): error is ApiError =>
  error instanceof ApiError;
