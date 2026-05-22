import { isClerkAPIResponseError } from "@clerk/nextjs/errors";

type ClerkErrorMeta = {
  paramName?: string;
  param_name?: string;
};

type RawClerkErrorItem = {
  code?: string;
  message?: string;
  longMessage?: string;
  long_message?: string;
  meta?: ClerkErrorMeta;
};

type NormalizedClerkErrorItem = {
  code: string;
  message: string;
  param: string | undefined;
};

const PASSWORD_ERROR_CODES = new Set([
  "form_password_pwned",
  "form_password_compromised",
  "form_password_incorrect",
  "form_password_length_too_short",
  "form_password_not_strong_enough",
  "form_password_validation_failed",
]);

const EMAIL_ERROR_CODES = new Set([
  "form_identifier_exists",
  "form_identifier_exists__email_address",
  "form_param_format_invalid__email_address",
]);

const USERNAME_ERROR_CODES = new Set([
  "form_identifier_exists__username",
  "form_param_format_invalid__username",
]);

const IDENTIFIER_ERROR_CODES = new Set([
  "form_identifier_not_found",
  "form_param_format_invalid",
]);

const CODE_ERROR_CODES = new Set([
  "form_code_incorrect",
  "verification_failed",
  "form_param_format_invalid__verification_code",
]);

const DEFAULT_FALLBACK = "Something went wrong. Please try again.";

const normalizeErrorItem = (item: RawClerkErrorItem): NormalizedClerkErrorItem => ({
  code: item.code ?? "",
  message: item.longMessage ?? item.long_message ?? item.message ?? "Invalid value",
  param: item.meta?.paramName ?? item.meta?.param_name,
});

const collectErrorItems = (error: unknown): NormalizedClerkErrorItem[] => {
  if (isClerkAPIResponseError(error)) {
    return error.errors.map((item) =>
      normalizeErrorItem({
        code: item.code,
        message: item.message,
        longMessage: item.longMessage,
        meta: item.meta,
      }),
    );
  }

  const candidate = error as { errors?: RawClerkErrorItem[] };
  if (candidate.errors?.length) {
    return candidate.errors.map(normalizeErrorItem);
  }

  return [];
};

const resolveFieldForError = (item: NormalizedClerkErrorItem): string | undefined => {
  const { code, param } = item;

  if (PASSWORD_ERROR_CODES.has(code) || param === "password" || code.includes("password")) {
    return "password";
  }
  if (USERNAME_ERROR_CODES.has(code) || param === "username" || code.includes("username")) {
    return "username";
  }
  if (EMAIL_ERROR_CODES.has(code) || param === "email_address" || code.includes("email")) {
    return "email";
  }
  if (IDENTIFIER_ERROR_CODES.has(code) || param === "identifier" || code.includes("identifier")) {
    return "identifier";
  }
  if (CODE_ERROR_CODES.has(code) || param === "code" || code.includes("code")) {
    return "code";
  }

  return undefined;
};

export const extractClerkErrorMessage = (error: unknown): string => {
  const items = collectErrorItems(error);
  if (items.length > 0) {
    return items[0].message;
  }

  const candidate = error as { message?: string };
  if (typeof candidate.message === "string" && candidate.message.length > 0) {
    return candidate.message;
  }

  return DEFAULT_FALLBACK;
};

export type ClerkErrorMapping = {
  fieldErrors: Record<string, string>;
  primaryMessage: string;
};

export const mapClerkErrorToFields = (error: unknown): ClerkErrorMapping => {
  const items = collectErrorItems(error);
  const fieldErrors: Record<string, string> = {};

  for (const item of items) {
    const field = resolveFieldForError(item);
    if (field && !fieldErrors[field]) {
      fieldErrors[field] = item.message;
    }
  }

  const primaryMessage =
    items[0]?.message ?? extractClerkErrorMessage(error);

  return { fieldErrors, primaryMessage };
};
