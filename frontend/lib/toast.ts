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

export const showSuccessToast = (message: string): string | number =>
  toast.success(truncateToastMessage(message), {
    duration: TOAST_SUCCESS_TIMEOUT_MS,
  });

export const showErrorToast = (error: unknown): string | number => {
  const message = isApiError(error)
    ? error.message
    : error instanceof Error
      ? error.message
      : DEFAULT_ERROR_MESSAGE;

  return toast.error(truncateToastMessage(message), {
    duration: TOAST_ERROR_DURATION_MS,
  });
};
