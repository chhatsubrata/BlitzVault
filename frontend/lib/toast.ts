import { toast } from "@heroui/react";
import { isApiError } from "@/lib/api-error";

const TOAST_SUCCESS_TIMEOUT_MS = 4_000;
const TOAST_ERROR_TIMEOUT_MS = 0;
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

export const showSuccessToast = (message: string): string =>
  toast.success(truncateToastMessage(message), {
    timeout: TOAST_SUCCESS_TIMEOUT_MS,
  });

export const showErrorToast = (error: unknown): string => {
  const message = isApiError(error)
    ? error.message
    : error instanceof Error
      ? error.message
      : DEFAULT_ERROR_MESSAGE;

  return toast.danger(truncateToastMessage(message), {
    timeout: TOAST_ERROR_TIMEOUT_MS,
  });
};
