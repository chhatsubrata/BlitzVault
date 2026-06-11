"use client";

import Lottie from "lottie-react";
import Link from "next/link";
import { AuthLoadingPanel, type AuthLoadingPhase } from "@/components/auth-loading-panel";
import { PasswordStrengthChecklist } from "@/components/password-strength-checklist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type AuthMode, useAuthForm } from "@/hooks/use-auth-form";
import signupAnimation from "@/public/lottie/signup.json";
import { googleSvg } from "@/public/svgs/svg";

type AuthFormCardProps = {
  mode: AuthMode;
};

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

  const showFormAlerts = !showLoadingBanner;

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
          <form className="p-6 md:p-8" onSubmit={handleSubmit}>
            <div className="relative flex w-full flex-col gap-6">
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="text-2xl font-bold">{title}</h1>
                <p className="text-sm text-muted-foreground">{subtitle}</p>
              </div>

              {showFormAlerts && errorMessage ? (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
                >
                  {errorMessage}
                </div>
              ) : null}

              {showFormAlerts && infoMessage ? (
                <div
                  role="status"
                  className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300"
                >
                  {infoMessage}
                </div>
              ) : null}

              {showLoadingBanner ? (
                <AuthLoadingPanel
                  phase={phase.step as AuthLoadingPhase}
                  email={
                    phase.step === "sending_verification" ? phase.email : undefined
                  }
                  showCaptcha={phase.step === "creating_account"}
                />
              ) : isVerifying ? (
                <>
                  <div className="w-full space-y-1.5">
                    <Label htmlFor="code">Verification Code</Label>
                    <Input
                      id="code"
                      name="code"
                      placeholder="123456"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      required
                      aria-invalid={Boolean(fieldErrors.code)}
                      value={verificationCode}
                      onChange={(e) => handleCodeChange(e.target.value)}
                      onBlur={handleVerificationCodeBlur}
                    />
                    <p className="text-sm text-muted-foreground">
                      Check your inbox for the 6-digit code.
                    </p>
                    {fieldErrors.code ? (
                      <p className="text-sm text-destructive">{fieldErrors.code}</p>
                    ) : null}
                  </div>

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
                        className="text-sm text-muted-foreground underline disabled:opacity-50"
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
                  <div className="w-full space-y-1.5">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      name="username"
                      placeholder="johndoe"
                      autoComplete="username"
                      required
                      aria-invalid={Boolean(fieldErrors.username)}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      onBlur={() => handleSignupFieldBlur("username")}
                    />
                    {fieldErrors.username ? (
                      <p className="text-sm text-destructive">{fieldErrors.username}</p>
                    ) : null}
                  </div>

                  <div className="w-full space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      name="email"
                      placeholder="john@example.com"
                      type="email"
                      autoComplete="email"
                      required
                      aria-invalid={Boolean(fieldErrors.email)}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={() => handleSignupFieldBlur("email")}
                    />
                    <p className="text-sm text-muted-foreground">
                      We&apos;ll use this to contact you. We will not share your email with anyone
                      else.
                    </p>
                    {fieldErrors.email ? (
                      <p className="text-sm text-destructive">{fieldErrors.email}</p>
                    ) : null}
                  </div>

                  <div className="w-full space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      required
                      aria-invalid={Boolean(fieldErrors.password)}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onBlur={() => handleSignupFieldBlur("password")}
                    />
                    <PasswordStrengthChecklist password={password} />
                    {fieldErrors.password ? (
                      <p className="text-sm text-destructive">{fieldErrors.password}</p>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <div className="w-full space-y-1.5">
                    <Label htmlFor="identifier">Email or Username</Label>
                    <Input
                      id="identifier"
                      name="identifier"
                      placeholder="john@example.com"
                      autoComplete="username"
                      required
                      aria-invalid={Boolean(fieldErrors.identifier)}
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      onBlur={() => handleSigninFieldBlur("identifier")}
                    />
                    {fieldErrors.identifier ? (
                      <p className="text-sm text-destructive">{fieldErrors.identifier}</p>
                    ) : null}
                  </div>

                  <div className="w-full space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      aria-invalid={Boolean(fieldErrors.password)}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onBlur={() => handleSigninFieldBlur("password")}
                    />
                    {fieldErrors.password ? (
                      <p className="text-sm text-destructive">{fieldErrors.password}</p>
                    ) : null}
                  </div>
                </>
              )}

              {!(showLoadingBanner && phase.step === "creating_account") ? (
                <div
                  id="clerk-captcha"
                  className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
                  aria-hidden
                />
              ) : null}

              {!showLoadingBanner ? (
                <Button type="submit" className="w-full" disabled={isSubmitDisabled}>
                  {!clerkReady ? "Loading..." : submitLabel}
                </Button>
              ) : null}

              {!isVerifying && !showLoadingBanner ? (
                <>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                    <span>Or continue with</span>
                    <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                  </div>

                  <Button
                    variant="outline"
                    type="button"
                    className="w-full"
                    onClick={handleGoogleAuth}
                    disabled={!clerkReady}
                  >
                    <div className="flex items-center justify-center">
                      <span className="h-6 w-6">{googleSvg}</span>
                      <span>{googleLabel}</span>
                    </div>
                  </Button>
                </>
              ) : null}

              <p className="text-center text-sm text-muted-foreground">
                {alternateText}{" "}
                <Link href={alternateHref} className="text-primary underline">
                  {alternateLabel}
                </Link>
              </p>
            </div>
          </form>

          <div className="relative hidden items-center justify-center bg-linear-to-br from-amber-50 via-rose-50 to-fuchsia-100/80 p-6 md:flex dark:from-zinc-900 dark:via-rose-950/30 dark:to-fuchsia-950/30">
            <Lottie animationData={signupAnimation} loop autoplay className="h-full w-full max-w-md" />
          </div>
        </div>
      </div>
    </div>
  );
}
