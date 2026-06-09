/** A single field-level validation/error detail. Mirrors FE lib/api-error.ts. */
export type ApiErrorDetail = {
    path: string;
    issue: string;
};

/** Target API error envelope — see docs/api-guidelines.md */
export type ApiErrorBody = {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
    requestId?: string;
};

export type ApiErrorResponse = {
    error: ApiErrorBody;
};

/** Target success envelope */
export type ApiSuccessResponse<T> = {
    data: T;
    meta?: Record<string, unknown>;
};

/** Legacy envelope (auth/users routes until Tuesday error handler) */
export type LegacyApiResponse<T> = {
    success: boolean;
    message: string;
    data?: T;
    errors?: string[];
};
