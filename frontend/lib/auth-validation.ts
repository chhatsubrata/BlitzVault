/**
 * Client-side auth validation aligned with backend/src/validators/auth.schema.ts
 * and Clerk-friendly field formats. Update if Clerk Dashboard password rules change.
 */
import { z } from "zod";

const IDENTIFIER_MIN_LENGTH = 3;
const PASSWORD_MIN_LENGTH = 8;
const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;
const VERIFICATION_CODE_PATTERN = /^\d{6}$/;

const emailField = z
  .string()
  .trim()
  .min(1, "Email is required")
  .email("Enter a valid email address");

const usernameField = z
  .string()
  .trim()
  .min(IDENTIFIER_MIN_LENGTH, `Username must be at least ${IDENTIFIER_MIN_LENGTH} characters`)
  .regex(USERNAME_PATTERN, "Username can only contain letters, numbers, and underscores");

const signupPasswordField = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[0-9]/, "Password must include a number");

const signinPasswordField = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`);

export const signupSchema = z.object({
  username: usernameField,
  email: emailField,
  password: signupPasswordField,
});

export const signinSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(IDENTIFIER_MIN_LENGTH, `Email or username must be at least ${IDENTIFIER_MIN_LENGTH} characters`),
  password: signinPasswordField,
});

export const verificationCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(VERIFICATION_CODE_PATTERN, "Enter the 6-digit code from your email"),
});

export type SignupFormValues = z.infer<typeof signupSchema>;
export type SigninFormValues = z.infer<typeof signinSchema>;
export type VerificationCodeValues = z.infer<typeof verificationCodeSchema>;

export type PasswordStrengthChecks = {
  minLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
};

export const getPasswordStrengthChecks = (password: string): PasswordStrengthChecks => ({
  minLength: password.length >= PASSWORD_MIN_LENGTH,
  hasUppercase: /[A-Z]/.test(password),
  hasLowercase: /[a-z]/.test(password),
  hasNumber: /[0-9]/.test(password),
});

export const isSignupPasswordStrong = (password: string): boolean =>
  Object.values(getPasswordStrengthChecks(password)).every(Boolean);

export const formatZodErrors = (error: z.ZodError): Record<string, string> => {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
};

export const validateSignup = (values: SignupFormValues) => signupSchema.safeParse(values);
export const validateSignin = (values: SigninFormValues) => signinSchema.safeParse(values);
export const validateVerificationCode = (code: string) =>
  verificationCodeSchema.safeParse({ code });

export const validateSignupField = (
  field: keyof SignupFormValues,
  value: string,
  values: SignupFormValues,
) => {
  const result = signupSchema.safeParse({ ...values, [field]: value });
  if (result.success) {
    return undefined;
  }
  const errors = formatZodErrors(result.error);
  return errors[field];
};

export const validateSigninField = (
  field: keyof SigninFormValues,
  value: string,
  values: SigninFormValues,
) => {
  const result = signinSchema.safeParse({ ...values, [field]: value });
  if (result.success) {
    return undefined;
  }
  const errors = formatZodErrors(result.error);
  return errors[field];
};
