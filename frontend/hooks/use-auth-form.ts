"use client";

import { useUser } from "@clerk/nextjs";
import { useSignIn, useSignUp } from "@clerk/nextjs/legacy";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  formatZodErrors,
  validateSignin,
  validateSigninField,
  validateSignup,
  validateSignupField,
  validateVerificationCode,
} from "@/lib/auth-validation";
import { mapClerkErrorToFields } from "@/lib/clerk-errors";
import { POST_AUTH_REDIRECT } from "@/lib/routes";

export type AuthMode = "signup" | "signin";

export type VerificationContext = "signup" | "signin";

export type AuthPhase =
  | { step: "form" }
  | { step: "creating_account" }
  | { step: "sending_verification"; email: string }
  | { step: "verify_email"; email: string; context: VerificationContext }
  | { step: "verifying_code"; email: string; context: VerificationContext }
  | { step: "signing_in" }
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
      router.replace(POST_AUTH_REDIRECT);
    }
  }, [isUserLoaded, isSignedIn, router]);

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
      router.push(POST_AUTH_REDIRECT);
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
        router.push(POST_AUTH_REDIRECT);
        return;
      }

      if (!isSignInLoaded || !signIn) {
        return;
      }
      const result = await signIn.attemptFirstFactor({ strategy: "email_code", code });
      if (result.status === "complete") {
        await setSignInActive({ session: result.createdSessionId });
        router.push(POST_AUTH_REDIRECT);
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

  const handleSignIn = useCallback(async () => {
    if (!isSignInLoaded || !signIn) {
      return;
    }

    const validation = validateSignin({ identifier, password });
    if (!validation.success) {
      setFieldErrors(formatZodErrors(validation.error));
      return;
    }

    const { identifier: validIdentifier, password: validPassword } = validation.data;

    setFieldErrors({});
    clearMessages();
    setPhase({ step: "signing_in" });

    const result = await signIn.create({
      identifier: validIdentifier,
      password: validPassword,
    });

    switch (result.status) {
      case "complete":
        await setSignInActive({ session: result.createdSessionId });
        router.push(POST_AUTH_REDIRECT);
        return;
      case "needs_first_factor": {
        const emailFactor = result.supportedFirstFactors?.find(isEmailCodeFactor);
        const displayEmail =
          emailFactor?.safeIdentifier ??
          (validIdentifier.includes("@") ? validIdentifier : "your email");
        await sendSignInEmailCode(displayEmail);
        return;
      }
      case "needs_second_factor":
        throw new Error("Two-factor authentication is required for this account.");
      case "needs_new_password":
        throw new Error("Your password must be reset before signing in.");
      default:
        throw new Error(`Sign-in could not complete (status: ${result.status}).`);
    }
  }, [
    clearMessages,
    identifier,
    isSignInLoaded,
    password,
    router,
    sendSignInEmailCode,
    setSignInActive,
    signIn,
  ]);

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

      try {
        if (isVerificationSubmit) {
          const ctx = phase.step === "verify_email" ? phase.context : phase.context;
          const emailAddress = phase.step === "verify_email" ? phase.email : phase.email;
          await handleVerifyCode(ctx, emailAddress);
          return;
        }

        if (isSignup) {
          await handleSignUp();
        } else {
          await handleSignIn();
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
        } else {
          setPhase({ step: "form" });
          router.replace("/signin");
        }
        handleClerkError(error);
      }
    },
    [
      clerkReady,
      clearMessages,
      handleClerkError,
      handleSignIn,
      handleSignUp,
      handleVerifyCode,
      isSignup,
      phase,
      returnToSignupForm,
      router,
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
        redirectUrlComplete: POST_AUTH_REDIRECT,
      });
    } catch (error) {
      if (isSignup) {
        returnToSignupForm();
      }
      handleClerkError(error);
    }
  }, [clearMessages, clerkReady, handleClerkError, isSignup, returnToSignupForm, signIn, signUp]);

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
    phase.step === "resending_code";

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
    verificationEmail,
    verificationContext,
    isLoadingPhase,
    handleSubmit,
    handleGoogleAuth,
    handleSignupFieldBlur,
    handleSigninFieldBlur,
    handleVerificationCodeBlur,
    handleResendCode,
    handleChangeEmail,
  };
}
