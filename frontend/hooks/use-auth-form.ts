"use client";

import { useUser } from "@clerk/nextjs";
import { useSignIn, useSignUp } from "@clerk/nextjs/legacy";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  formatZodErrors,
  validateSigninField,
  validateSignup,
  validateSignupField,
  validateVerificationCode,
} from "@/lib/auth-validation";
import { mapClerkErrorToFields } from "@/lib/clerk-errors";
import { REDIRECT_PARAM, resolvePostAuthRedirect } from "@/lib/routes";

export type AuthMode = "signup" | "signin";

export type VerificationContext = "signup" | "signin";

export type AuthPhase =
  | { step: "form" }
  | { step: "creating_account" }
  | { step: "sending_verification"; email: string }
  | { step: "verify_email"; email: string; context: VerificationContext }
  | { step: "verifying_code"; email: string; context: VerificationContext }
  | { step: "signing_in" }
  // Sign-in step 1 in flight: discovering the account's first factors. Kept
  // separate from `signing_in` so the UI shows a light inline spinner, not the
  // full-screen multi-step loading panel, while we decide password vs code.
  | { step: "checking_identifier" }
  // Sign-in step 2: the identifier resolved to a password account, so reveal
  // the password field. `emailCodeAvailable` toggles the "use a code" fallback.
  | { step: "collect_password"; emailCodeAvailable: boolean }
  | { step: "resending_code"; email: string; context: VerificationContext };

const RESEND_COOLDOWN_SECONDS = 60;

type EmailCodeFactorShape = {
  strategy: "email_code";
  emailAddressId: string;
  safeIdentifier: string;
};

const isEmailCodeFactor = (factor: { strategy: string }): factor is EmailCodeFactorShape =>
  factor.strategy === "email_code";

export function useAuthForm(mode: AuthMode) {
  const isSignup = mode === "signup";
  const router = useRouter();
  const searchParams = useSearchParams();
  // Where to land after auth — the deep link the user originally requested
  // (validated to same-origin), or the default drive route.
  const redirectTo = resolvePostAuthRedirect(searchParams.get(REDIRECT_PARAM));
  const { isLoaded: isUserLoaded, isSignedIn } = useUser();
  const { isLoaded: isSignUpLoaded, signUp, setActive: setSignUpActive } = useSignUp();
  const { isLoaded: isSignInLoaded, signIn, setActive: setSignInActive } = useSignIn();

  const [phase, setPhase] = useState<AuthPhase>({ step: "form" });
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  const clerkReady = isSignup ? isSignUpLoaded : isSignInLoaded;

  useEffect(() => {
    if (isUserLoaded && isSignedIn) {
      router.replace(redirectTo);
    }
  }, [isUserLoaded, isSignedIn, redirectTo, router]);

  useEffect(() => {
    if (resendCooldown <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setResendCooldown((seconds) => (seconds <= 1 ? 0 : seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  const clearMessages = useCallback(() => {
    setErrorMessage(null);
    setInfoMessage(null);
  }, []);

  const setFieldError = useCallback((field: string, message: string | undefined) => {
    setFieldErrors((current) => {
      const next = { ...current };
      if (message) {
        next[field] = message;
      } else {
        delete next[field];
      }
      return next;
    });
  }, []);

  const handleClerkError = useCallback((error: unknown) => {
    const { fieldErrors: mapped, primaryMessage } = mapClerkErrorToFields(error);
    if (Object.keys(mapped).length > 0) {
      setFieldErrors((current) => ({ ...current, ...mapped }));
      setErrorMessage(null);
    } else {
      setErrorMessage(primaryMessage);
    }
  }, []);

  /** Return to the initial signup form (not loading / verify steps). */
  const returnToSignupForm = useCallback(() => {
    setPhase({ step: "form" });
    setInfoMessage(null);
    if (isSignup) {
      router.replace("/signup");
    }
  }, [isSignup, router]);

  const startResendCooldown = useCallback(() => {
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
  }, []);

  const sendSignUpVerification = useCallback(
    async (emailAddress: string) => {
      if (!isSignUpLoaded || !signUp) {
        return;
      }
      setPhase({ step: "sending_verification", email: emailAddress });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPhase({ step: "verify_email", email: emailAddress, context: "signup" });
      setInfoMessage(`We sent a verification code to ${emailAddress}.`);
      startResendCooldown();
    },
    [isSignUpLoaded, signUp, startResendCooldown],
  );

  const sendSignInEmailCode = useCallback(
    async (emailAddress: string) => {
      if (!isSignInLoaded || !signIn) {
        return;
      }
      const emailFactor = signIn.supportedFirstFactors?.find(isEmailCodeFactor);
      if (!emailFactor) {
        throw new Error("Email verification is not available for this account.");
      }
      setPhase({ step: "sending_verification", email: emailAddress });
      await signIn.prepareFirstFactor({
        strategy: "email_code",
        emailAddressId: emailFactor.emailAddressId,
      });
      const displayEmail = emailFactor.safeIdentifier ?? emailAddress;
      setPhase({ step: "verify_email", email: displayEmail, context: "signin" });
      setInfoMessage(`We sent a verification code to ${displayEmail}.`);
      startResendCooldown();
    },
    [isSignInLoaded, signIn, startResendCooldown],
  );

  const handleSignUp = useCallback(async () => {
    if (!isSignUpLoaded || !signUp) {
      return;
    }

    const validation = validateSignup({ username, email, password });
    if (!validation.success) {
      setFieldErrors(formatZodErrors(validation.error));
      return;
    }

    const { username: validUsername, email: validEmail, password: validPassword } =
      validation.data;

    setFieldErrors({});
    clearMessages();
    setPhase({ step: "creating_account" });

    const created = await signUp.create({
      emailAddress: validEmail,
      username: validUsername,
      password: validPassword,
    });

    if (created.status === "complete") {
      await setSignUpActive({ session: created.createdSessionId });
      router.push(redirectTo);
      return;
    }

    const missingFields = created.missingFields ?? [];
    if (missingFields.includes("password")) {
      throw new Error(
        "Sign-up could not be completed. Check the highlighted fields and try again.",
      );
    }

    await sendSignUpVerification(validEmail);
  }, [
    clearMessages,
    email,
    isSignUpLoaded,
    password,
    redirectTo,
    router,
    sendSignUpVerification,
    setSignUpActive,
    signUp,
    username,
  ]);

  const handleVerifyCode = useCallback(
    async (context: VerificationContext, emailAddress: string) => {
      const validation = validateVerificationCode(verificationCode);
      if (!validation.success) {
        setFieldErrors(formatZodErrors(validation.error));
        return;
      }

      setFieldErrors({});
      clearMessages();
      setPhase({ step: "verifying_code", email: emailAddress, context });

      const code = validation.data.code;

      if (context === "signup") {
        if (!isSignUpLoaded || !signUp) {
          return;
        }
        const result = await signUp.attemptEmailAddressVerification({ code });
        if (result.status !== "complete") {
          throw new Error(
            "Verification did not complete. Check the code or request a new one.",
          );
        }
        await setSignUpActive({ session: result.createdSessionId });
        router.push(redirectTo);
        return;
      }

      if (!isSignInLoaded || !signIn) {
        return;
      }
      const result = await signIn.attemptFirstFactor({ strategy: "email_code", code });
      if (result.status === "complete") {
        await setSignInActive({ session: result.createdSessionId });
        router.push(redirectTo);
        return;
      }
      if (result.status === "needs_second_factor") {
        throw new Error("Two-factor authentication is required for this account.");
      }
      throw new Error(
        "Verification did not complete. Check the code or request a new one.",
      );
    },
    [
      clearMessages,
      isSignInLoaded,
      isSignUpLoaded,
      redirectTo,
      router,
      setSignInActive,
      setSignUpActive,
      signIn,
      signUp,
      verificationCode,
    ],
  );

  const handleResendCode = useCallback(
    async (context: VerificationContext, emailAddress: string) => {
      if (resendCooldown > 0) {
        return;
      }
      clearMessages();
      setPhase({ step: "resending_code", email: emailAddress, context });

      try {
        if (context === "signup") {
          if (!isSignUpLoaded || !signUp) {
            return;
          }
          await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
        } else {
          if (!isSignInLoaded || !signIn) {
            return;
          }
          const emailFactor = signIn.supportedFirstFactors?.find(isEmailCodeFactor);
          if (!emailFactor) {
            throw new Error("Email verification is not available for this account.");
          }
          await signIn.prepareFirstFactor({
            strategy: "email_code",
            emailAddressId: emailFactor.emailAddressId,
          });
        }
        setPhase({ step: "verify_email", email: emailAddress, context });
        setInfoMessage("A new verification code has been sent.");
        startResendCooldown();
      } catch (error) {
        handleClerkError(error);
        setPhase({ step: "verify_email", email: emailAddress, context });
      }
    },
    [
      clearMessages,
      handleClerkError,
      isSignInLoaded,
      isSignUpLoaded,
      resendCooldown,
      signIn,
      signUp,
      startResendCooldown,
    ],
  );

  /**
   * Sign-in step 1: submit the identifier only. Discovers the account's first
   * factors, then either reveals the password field (password accounts) or
   * sends an email code (passwordless) — the password is never asked for up
   * front, and never sent to an account that has none.
   */
  const handleSignInIdentifier = useCallback(async () => {
    if (!isSignInLoaded || !signIn) {
      return;
    }

    const trimmedIdentifier = identifier.trim();
    const identifierError = validateSigninField("identifier", trimmedIdentifier, {
      identifier: trimmedIdentifier,
      password: "",
    });
    if (identifierError) {
      setFieldError("identifier", identifierError);
      return;
    }

    setFieldErrors({});
    clearMessages();
    // Light in-flight state (button spinner) — not the full loading panel.
    setPhase({ step: "checking_identifier" });

    const result = await signIn.create({ identifier: trimmedIdentifier });

    if (result.status === "complete") {
      await setSignInActive({ session: result.createdSessionId });
      router.push(redirectTo);
      return;
    }

    if (result.status !== "needs_first_factor") {
      if (result.status === "needs_second_factor") {
        throw new Error("Two-factor authentication is required for this account.");
      }
      if (result.status === "needs_new_password") {
        throw new Error("Your password must be reset before signing in.");
      }
      throw new Error(`Sign-in could not complete (status: ${result.status}).`);
    }

    const factors = result.supportedFirstFactors ?? [];
    const supportsPassword = factors.some((factor) => factor.strategy === "password");
    const emailFactor = factors.find(isEmailCodeFactor);

    // Password account -> ask for the password now (step 2).
    if (supportsPassword) {
      setPhase({ step: "collect_password", emailCodeAvailable: Boolean(emailFactor) });
      return;
    }

    // Passwordless -> straight to an email code.
    if (emailFactor) {
      const displayEmail =
        emailFactor.safeIdentifier ??
        (trimmedIdentifier.includes("@") ? trimmedIdentifier : "your email");
      await sendSignInEmailCode(displayEmail);
      return;
    }

    throw new Error("No supported sign-in method is available for this account.");
  }, [
    clearMessages,
    identifier,
    isSignInLoaded,
    redirectTo,
    router,
    sendSignInEmailCode,
    setFieldError,
    setSignInActive,
    signIn,
  ]);

  /** Sign-in step 2: attempt the password against the started sign-in. */
  const handleSignInPassword = useCallback(async () => {
    if (!isSignInLoaded || !signIn) {
      return;
    }

    if (password.length === 0) {
      setFieldError("password", "Enter your password to sign in.");
      return;
    }

    setFieldErrors({});
    clearMessages();
    setPhase({ step: "signing_in" });

    const attempt = await signIn.attemptFirstFactor({
      strategy: "password",
      password,
    });

    if (attempt.status === "complete") {
      await setSignInActive({ session: attempt.createdSessionId });
      router.push(redirectTo);
      return;
    }
    if (attempt.status === "needs_second_factor") {
      throw new Error("Two-factor authentication is required for this account.");
    }
    throw new Error(`Sign-in could not complete (status: ${attempt.status}).`);
  }, [
    clearMessages,
    isSignInLoaded,
    password,
    redirectTo,
    router,
    setFieldError,
    setSignInActive,
    signIn,
  ]);

  /** From the password step, switch to an email code instead. */
  const handleUseEmailCodeInstead = useCallback(async () => {
    if (!isSignInLoaded || !signIn) {
      return;
    }
    clearMessages();
    setFieldErrors({});
    const emailFactor = signIn.supportedFirstFactors?.find(isEmailCodeFactor);
    const displayEmail =
      emailFactor?.safeIdentifier ??
      (identifier.includes("@") ? identifier : "your email");
    try {
      await sendSignInEmailCode(displayEmail);
    } catch (error) {
      handleClerkError(error);
    }
  }, [clearMessages, handleClerkError, identifier, isSignInLoaded, sendSignInEmailCode, signIn]);

  /** From the password step, go back to editing the identifier. */
  const handleChangeIdentifier = useCallback(() => {
    clearMessages();
    setFieldErrors({});
    setPassword("");
    setPhase({ step: "form" });
  }, [clearMessages]);

  const handleChangeEmail = useCallback(async () => {
    clearMessages();
    setFieldErrors({});
    setVerificationCode("");
    setResendCooldown(0);
    if (isSignUpLoaded && signUp) {
      await signUp.reload();
    }
    returnToSignupForm();
  }, [clearMessages, isSignUpLoaded, returnToSignupForm, signUp]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      clearMessages();

      if (!clerkReady) {
        setErrorMessage("Authentication is still initializing. Please try again in a moment.");
        return;
      }

      const isVerificationSubmit =
        phase.step === "verify_email" || phase.step === "verifying_code";
      // Sign-in step 2 (password) vs step 1 (identifier) — captured from the
      // render-time phase before we flip it to "signing_in".
      const isPasswordStep = !isSignup && phase.step === "collect_password";
      const emailCodeAvailable =
        phase.step === "collect_password" ? phase.emailCodeAvailable : false;

      try {
        if (isVerificationSubmit) {
          const ctx = phase.step === "verify_email" ? phase.context : phase.context;
          const emailAddress = phase.step === "verify_email" ? phase.email : phase.email;
          await handleVerifyCode(ctx, emailAddress);
          return;
        }

        if (isSignup) {
          await handleSignUp();
        } else if (isPasswordStep) {
          await handleSignInPassword();
        } else {
          await handleSignInIdentifier();
        }
      } catch (error) {
        // Phase at catch time can be stale (e.g. still "form" while create set
        // "creating_account"). Use submit intent so Clerk errors show on the form.
        if (isVerificationSubmit) {
          const emailAddress = phase.step === "verify_email" ? phase.email : phase.email;
          const context = phase.step === "verify_email" ? phase.context : phase.context;
          setPhase({ step: "verify_email", email: emailAddress, context });
        } else if (isSignup) {
          returnToSignupForm();
        } else if (isPasswordStep) {
          // Keep the password field open so the user can retry.
          setPhase({ step: "collect_password", emailCodeAvailable });
        } else {
          // Already on /signin — just reset the phase; navigating here would
          // drop the redirect_url query param we need after a retry.
          setPhase({ step: "form" });
        }
        handleClerkError(error);
      }
    },
    [
      clerkReady,
      clearMessages,
      handleClerkError,
      handleSignInIdentifier,
      handleSignInPassword,
      handleSignUp,
      handleVerifyCode,
      isSignup,
      phase,
      returnToSignupForm,
    ],
  );

  const handleGoogleAuth = useCallback(async () => {
    clearMessages();
    const clerkHelper = isSignup ? signUp : signIn;
    if (!clerkReady || !clerkHelper) {
      setErrorMessage("Authentication is still initializing. Please try again in a moment.");
      return;
    }
    try {
      await clerkHelper.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sso-callback",
        redirectUrlComplete: redirectTo,
      });
    } catch (error) {
      if (isSignup) {
        returnToSignupForm();
      }
      handleClerkError(error);
    }
  }, [clearMessages, clerkReady, handleClerkError, isSignup, redirectTo, returnToSignupForm, signIn, signUp]);

  const handleSignupFieldBlur = useCallback(
    (field: "username" | "email" | "password") => {
      const message = validateSignupField(field, { username, email, password }[field], {
        username,
        email,
        password,
      });
      setFieldError(field, message);
    },
    [email, password, setFieldError, username],
  );

  const handleSigninFieldBlur = useCallback(
    (field: "identifier" | "password") => {
      const message = validateSigninField(field, { identifier, password }[field], {
        identifier,
        password,
      });
      setFieldError(field, message);
    },
    [identifier, password, setFieldError],
  );

  const handleVerificationCodeBlur = useCallback(() => {
    const result = validateVerificationCode(verificationCode);
    setFieldError("code", result.success ? undefined : formatZodErrors(result.error).code);
  }, [setFieldError, verificationCode]);

  const isVerifying =
    phase.step === "verify_email" ||
    phase.step === "verifying_code" ||
    phase.step === "resending_code";

  const verificationEmail =
    phase.step === "verify_email" ||
    phase.step === "verifying_code" ||
    phase.step === "resending_code" ||
    phase.step === "sending_verification"
      ? phase.email
      : email;

  const verificationContext: VerificationContext | null =
    phase.step === "verify_email" ||
    phase.step === "verifying_code" ||
    phase.step === "resending_code"
      ? phase.context
      : null;

  const isLoadingPhase =
    phase.step === "creating_account" ||
    phase.step === "sending_verification" ||
    phase.step === "verifying_code" ||
    phase.step === "signing_in" ||
    phase.step === "checking_identifier" ||
    phase.step === "resending_code";

  // Sign-in step 2: password field is revealed for a password account.
  const isCollectingPassword = phase.step === "collect_password";
  const emailCodeAvailable =
    phase.step === "collect_password" ? phase.emailCodeAvailable : false;

  return {
    isSignup,
    phase,
    clerkReady,
    username,
    setUsername,
    email,
    setEmail,
    identifier,
    setIdentifier,
    password,
    setPassword,
    verificationCode,
    setVerificationCode,
    fieldErrors,
    errorMessage,
    infoMessage,
    resendCooldown,
    isVerifying,
    isCollectingPassword,
    emailCodeAvailable,
    verificationEmail,
    verificationContext,
    isLoadingPhase,
    handleSubmit,
    handleGoogleAuth,
    handleUseEmailCodeInstead,
    handleChangeIdentifier,
    handleSignupFieldBlur,
    handleSigninFieldBlur,
    handleVerificationCodeBlur,
    handleResendCode,
    handleChangeEmail,
  };
}
