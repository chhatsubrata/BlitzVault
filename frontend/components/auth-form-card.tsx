"use client";

import { Button, Description, FieldError, Form, Input, Label, TextField } from "@heroui/react";
import Lottie from "lottie-react";
import Link from "next/link";
import { AuthStatusBanner } from "@/components/auth-status-banner";
import { PasswordStrengthChecklist } from "@/components/password-strength-checklist";
import { type AuthMode, useAuthForm } from "@/hooks/use-auth-form";
import signupAnimation from "@/public/lottie/signup.json";
import { googleSvg } from "@/public/svgs/svg";

type AuthFormCardProps = {
  mode: AuthMode;
};

const inputClassName = "border border-zinc-200 rounded-medium focus-within:border-zinc-300";

export function AuthFormCard({ mode }: AuthFormCardProps) {
  const auth = useAuthForm(mode);

  const {
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
    handleSubmit,
    handleGoogleAuth,
    handleSignupFieldBlur,
    handleSigninFieldBlur,
    handleVerificationCodeBlur,
    handleResendCode,
    handleChangeEmail,
  } = auth;

  const showLoadingBanner =
    phase.step === "creating_account" ||
    phase.step === "sending_verification" ||
    phase.step === "signing_in";

  const title = showLoadingBanner
    ? phase.step === "creating_account"
      ? "Creating your account"
      : phase.step === "sending_verification"
        ? "Sending verification code"
        : "Signing you in"
    : isVerifying
      ? "Verify your email"
      : isSignup
        ? "Create your account"
        : "Welcome back";

  const subtitle = showLoadingBanner
    ? phase.step === "creating_account"
      ? "Completing security check and setting up your profile."
      : phase.step === "sending_verification"
        ? `Sending a 6-digit code to ${phase.email}.`
        : "Checking your credentials."
    : isVerifying
      ? `Enter the 6-digit code we sent to ${verificationEmail}.`
      : isSignup
        ? "Enter your details below to create your account."
        : "Enter your credentials to sign in.";

  const submitLabel = isVerifying
    ? phase.step === "verifying_code"
      ? "Verifying code..."
      : "Verify Email"
    : isSignup
      ? phase.step === "creating_account"
        ? "Creating account..."
        : "Create Account"
      : phase.step === "signing_in"
        ? "Signing in..."
        : "Sign In";

  const googleLabel = isSignup ? "Sign up with Google" : "Sign in with Google";
  const alternateText = isSignup ? "Already have an account?" : "Don't have an account?";
  const alternateHref = isSignup ? "/signin" : "/signup";
  const alternateLabel = isSignup ? "Sign in" : "Sign up";

  const isSubmitDisabled =
    !clerkReady ||
    phase.step === "creating_account" ||
    phase.step === "sending_verification" ||
    phase.step === "verifying_code" ||
    phase.step === "signing_in" ||
    phase.step === "resending_code";

  const handleCodeChange = (value: string) => {
    const digitsOnly = value.replace(/\D/g, "").slice(0, 6);
    setVerificationCode(digitsOnly);
  };

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center px-4 py-4">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="grid overflow-hidden rounded-3xl bg-linear-to-br from-white via-zinc-50 to-indigo-50/80 shadow-[0_20px_60px_-20px_rgba(79,70,229,0.35)] md:grid-cols-2 dark:from-zinc-950 dark:via-zinc-900 dark:to-indigo-950/40 dark:shadow-[0_20px_60px_-20px_rgba(99,102,241,0.35)]">
          <Form className="p-6 md:p-8" onSubmit={handleSubmit}>
            <div className="flex w-full flex-col gap-6">
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="text-2xl font-bold">{title}</h1>
                <p className="text-sm text-default-500">{subtitle}</p>
              </div>

              {errorMessage ? (
                <div
                  role="alert"
                  className="rounded-medium border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
                >
                  {errorMessage}
                </div>
              ) : null}

              {infoMessage ? (
                <div
                  role="status"
                  className="rounded-medium border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300"
                >
                  {infoMessage}
                </div>
              ) : null}

              <div
                id="clerk-captcha"
                className={phase.step === "creating_account" ? "min-h-px" : undefined}
              />

              {showLoadingBanner ? (
                <AuthStatusBanner
                  title={
                    phase.step === "creating_account"
                      ? "Creating your account…"
                      : phase.step === "sending_verification"
                        ? "Sending verification code…"
                        : "Signing you in…"
                  }
                  description={
                    phase.step === "creating_account"
                      ? "This may take a moment while we complete security checks."
                      : phase.step === "sending_verification"
                        ? `We are emailing a code to ${phase.email}.`
                        : undefined
                  }
                  hint={
                    phase.step === "creating_account"
                      ? "Completing security check…"
                      : undefined
                  }
                />
              ) : isVerifying ? (
                <>
                  <TextField
                    className="w-full"
                    name="code"
                    isInvalid={Boolean(fieldErrors.code)}
                    isRequired
                    value={verificationCode}
                    onChange={handleCodeChange}
                    onBlur={handleVerificationCodeBlur}
                  >
                    <Label>Verification Code</Label>
                    <Input
                      placeholder="123456"
                      className={inputClassName}
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                    />
                    <Description>Check your inbox for the 6-digit code.</Description>
                    {fieldErrors.code ? <FieldError>{fieldErrors.code}</FieldError> : null}
                  </TextField>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      className="text-sm text-primary underline disabled:opacity-50"
                      onClick={() => {
                        if (verificationContext) {
                          void handleResendCode(verificationContext, verificationEmail);
                        }
                      }}
                      disabled={resendCooldown > 0 || phase.step === "resending_code"}
                    >
                      {phase.step === "resending_code"
                        ? "Resending..."
                        : resendCooldown > 0
                          ? `Resend code (${resendCooldown}s)`
                          : "Resend code"}
                    </button>
                    {verificationContext === "signup" ? (
                      <button
                        type="button"
                        className="text-sm text-default-500 underline disabled:opacity-50"
                        onClick={() => void handleChangeEmail()}
                        disabled={phase.step === "resending_code" || phase.step === "verifying_code"}
                      >
                        Change email
                      </button>
                    ) : null}
                  </div>
                </>
              ) : isSignup ? (
                <>
                  <TextField
                    className="w-full"
                    name="username"
                    isInvalid={Boolean(fieldErrors.username)}
                    isRequired
                    value={username}
                    onChange={setUsername}
                    onBlur={() => handleSignupFieldBlur("username")}
                  >
                    <Label>Username</Label>
                    <Input placeholder="johndoe" className={inputClassName} autoComplete="username" />
                    {fieldErrors.username ? (
                      <FieldError>{fieldErrors.username}</FieldError>
                    ) : null}
                  </TextField>

                  <TextField
                    className="w-full"
                    name="email"
                    isInvalid={Boolean(fieldErrors.email)}
                    isRequired
                    value={email}
                    onChange={setEmail}
                    onBlur={() => handleSignupFieldBlur("email")}
                  >
                    <Label>Email</Label>
                    <Input
                      placeholder="john@example.com"
                      className={inputClassName}
                      type="email"
                      autoComplete="email"
                    />
                    <Description>
                      We&apos;ll use this to contact you. We will not share your email with anyone
                      else.
                    </Description>
                    {fieldErrors.email ? <FieldError>{fieldErrors.email}</FieldError> : null}
                  </TextField>

                  <TextField
                    className="w-full"
                    name="password"
                    isInvalid={Boolean(fieldErrors.password)}
                    isRequired
                    value={password}
                    onChange={setPassword}
                    onBlur={() => handleSignupFieldBlur("password")}
                  >
                    <Label>Password</Label>
                    <Input className={inputClassName} type="password" autoComplete="new-password" />
                    <PasswordStrengthChecklist password={password} />
                    {fieldErrors.password ? (
                      <FieldError>{fieldErrors.password}</FieldError>
                    ) : null}
                  </TextField>
                </>
              ) : (
                <>
                  <TextField
                    className="w-full"
                    name="identifier"
                    isInvalid={Boolean(fieldErrors.identifier)}
                    isRequired
                    value={identifier}
                    onChange={setIdentifier}
                    onBlur={() => handleSigninFieldBlur("identifier")}
                  >
                    <Label>Email or Username</Label>
                    <Input
                      placeholder="john@example.com"
                      className={inputClassName}
                      autoComplete="username"
                    />
                    {fieldErrors.identifier ? (
                      <FieldError>{fieldErrors.identifier}</FieldError>
                    ) : null}
                  </TextField>

                  <TextField
                    className="w-full"
                    name="password"
                    isInvalid={Boolean(fieldErrors.password)}
                    isRequired
                    value={password}
                    onChange={setPassword}
                    onBlur={() => handleSigninFieldBlur("password")}
                  >
                    <Label>Password</Label>
                    <Input className={inputClassName} type="password" autoComplete="current-password" />
                    {fieldErrors.password ? (
                      <FieldError>{fieldErrors.password}</FieldError>
                    ) : null}
                  </TextField>
                </>
              )}

              {!showLoadingBanner ? (
                <Button type="submit" className="w-full" isDisabled={isSubmitDisabled}>
                  {!clerkReady ? "Loading..." : submitLabel}
                </Button>
              ) : null}

              {!isVerifying && !showLoadingBanner ? (
                <>
                  <div className="flex items-center gap-3 text-sm text-default-500">
                    <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                    <span>Or continue with</span>
                    <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                  </div>

                  <Button
                    variant="outline"
                    type="button"
                    className="w-full"
                    onPress={handleGoogleAuth}
                    isDisabled={!clerkReady}
                  >
                    <div className="flex items-center justify-center">
                      <span className="h-6 w-6">{googleSvg}</span>
                      <span>{googleLabel}</span>
                    </div>
                  </Button>
                </>
              ) : null}

              <p className="text-center text-sm text-default-500">
                {alternateText}{" "}
                <Link href={alternateHref} className="text-primary underline">
                  {alternateLabel}
                </Link>
              </p>
            </div>
          </Form>

          <div className="relative hidden items-center justify-center bg-linear-to-br from-amber-50 via-rose-50 to-fuchsia-100/80 p-6 md:flex dark:from-zinc-900 dark:via-rose-950/30 dark:to-fuchsia-950/30">
            <Lottie animationData={signupAnimation} loop autoplay className="h-full w-full max-w-md" />
          </div>
        </div>
      </div>
    </div>
  );
}
