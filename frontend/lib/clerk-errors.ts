type ClerkLikeError = {
  errors?: Array<{
    code?: string;
    longMessage?: string;
    message?: string;
    meta?: { paramName?: string };
  }>;
  message?: string;
};

export const extractClerkErrorMessage = (error: unknown): string => {
  const candidate = error as ClerkLikeError;
  return (
    candidate?.errors?.[0]?.longMessage ??
    candidate?.errors?.[0]?.message ??
    candidate?.message ??
    "Something went wrong. Please try again."
  );
};

const IDENTIFIER_ERROR_CODES = new Set([
  "form_identifier_exists",
  "form_identifier_exists__email_address",
  "form_identifier_exists__username",
  "form_identifier_not_found",
  "form_param_format_invalid",
]);

export const mapClerkErrorToFields = (
  error: unknown,
): { fieldErrors: Record<string, string>; globalMessage: string | null } => {
  const candidate = error as ClerkLikeError;
  const fieldErrors: Record<string, string> = {};

  if (!candidate?.errors?.length) {
    return { fieldErrors, globalMessage: extractClerkErrorMessage(error) };
  }

  for (const clerkError of candidate.errors) {
    const message = clerkError.longMessage ?? clerkError.message ?? "Invalid value";
    const code = clerkError.code ?? "";
    const param = clerkError.meta?.paramName;

    if (code.includes("password") || param === "password") {
      fieldErrors.password = message;
    } else if (code.includes("username") || param === "username") {
      fieldErrors.username = message;
    } else if (code.includes("email") || param === "email_address") {
      fieldErrors.email = message;
    } else if (code.includes("identifier") || param === "identifier") {
      fieldErrors.identifier = message;
    } else if (code.includes("code") || param === "code") {
      fieldErrors.code = message;
    } else if (IDENTIFIER_ERROR_CODES.has(code)) {
      if (code.includes("username")) {
        fieldErrors.username = message;
      } else {
        fieldErrors.email = message;
        fieldErrors.identifier = message;
      }
    }
  }

  const globalMessage =
    Object.keys(fieldErrors).length > 0 ? null : extractClerkErrorMessage(error);

  return { fieldErrors, globalMessage };
};
