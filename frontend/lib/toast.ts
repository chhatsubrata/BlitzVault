import { toast } from "sonner";
import { isApiError } from "@/lib/api-error";

const TOAST_SUCCESS_TIMEOUT_MS = 4_000;
// Errors auto-dismiss too; the close button lets users clear them sooner.
const TOAST_ERROR_DURATION_MS = 4_000;
const TOAST_MAX_MESSAGE_LENGTH = 80;

const DEFAULT_ERROR_MESSAGE = "Something went wrong. Please try again.";

export const truncateToastMessage = (
  message: string,
  maxLength = TOAST_MAX_MESSAGE_LENGTH,
): string => {
  const trimmed = message.trim().replace(/\s+/g, " ");
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 1)}…`;
};

// An optional `id` lets a call replace an existing toast in place — e.g. flip a
// loading toast to success/error rather than stacking a second one.
type ToastId = string | number;

export const showSuccessToast = (message: string, id?: ToastId): ToastId =>
  toast.success(truncateToastMessage(message), {
    id,
    duration: TOAST_SUCCESS_TIMEOUT_MS,
  });

export const showErrorToast = (error: unknown, id?: ToastId): ToastId => {
  const message = isApiError(error)
    ? error.message
    : error instanceof Error
      ? error.message
      : DEFAULT_ERROR_MESSAGE;

  return toast.error(truncateToastMessage(message), {
    id,
    duration: TOAST_ERROR_DURATION_MS,
  });
};

/**
 * Loading toast for an in-flight action. It persists (no auto-dismiss) until
 * replaced via its returned id — pass that id to showSuccessToast/showErrorToast.
 */
export const showLoadingToast = (message: string): ToastId =>
  toast.loading(truncateToastMessage(message));

// Longer window than a plain success toast so there's time to hit Undo.
const TOAST_UNDO_DURATION_MS = 8_000;

/** Success toast with an inline action (e.g. "Undo" after a soft-delete). */
export const showUndoToast = (
  message: string,
  action: { label: string; onClick: () => void },
): string | number =>
  toast.success(truncateToastMessage(message), {
    duration: TOAST_UNDO_DURATION_MS,
    action,
  });
