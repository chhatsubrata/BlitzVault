"use client";

import { useEffect, useRef, useState } from "react";

export type AuthLoadingPhase = "creating_account" | "sending_verification" | "signing_in";

type AuthLoadingPanelProps = {
  phase: AuthLoadingPhase;
  email?: string;
  showCaptcha?: boolean;
};

const PHASE_COPY: Record<
  AuthLoadingPhase,
  { steps: string[]; description: string }
> = {
  creating_account: {
    steps: ["Security check", "Creating your profile", "Almost done"],
    description: "Hang tight while we set things up. This usually takes a few seconds.",
  },
  sending_verification: {
    steps: ["Preparing email", "Sending code", "Almost done"],
    description: "We are sending a verification code to your inbox.",
  },
  signing_in: {
    steps: ["Checking credentials", "Starting session", "Almost done"],
    description: "Signing you in securely.",
  },
};

const hasCaptchaContent = (node: HTMLDivElement): boolean =>
  node.childElementCount > 0 || node.getBoundingClientRect().height > 8;

function ClerkCaptchaMount() {
  const captchaRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = captchaRef.current;
    if (!node) {
      return;
    }

    const sync = () => {
      setIsVisible(hasCaptchaContent(node));
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(node, { childList: true, subtree: true, attributes: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={
        isVisible
          ? "flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/80 px-4 py-5 transition-opacity duration-200 dark:border-zinc-800 dark:bg-zinc-900/50"
          : "h-0 overflow-hidden"
      }
      aria-hidden={!isVisible}
    >
      {isVisible ? (
        <p className="text-xs font-medium tracking-wide text-default-500 uppercase">
          Verify you&apos;re human
        </p>
      ) : null}
      <div
        id="clerk-captcha"
        ref={captchaRef}
        className={
          isVisible
            ? "flex min-h-20 w-full max-w-sm items-center justify-center"
            : "pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
        }
        aria-hidden={!isVisible}
      />
    </div>
  );
}

export function AuthLoadingPanel({ phase, email, showCaptcha = false }: AuthLoadingPanelProps) {
  const { steps, description } = PHASE_COPY[phase];
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    setActiveStep(0);
    const interval = window.setInterval(() => {
      setActiveStep((current) => (current < steps.length - 1 ? current + 1 : current));
    }, 2200);
    return () => window.clearInterval(interval);
  }, [phase, steps.length]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex w-full flex-col gap-6"
    >
      <div className="relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/90 px-6 py-8 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/90">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-b from-indigo-500/10 to-transparent dark:from-indigo-400/10"
          aria-hidden
        />

        <div className="relative flex flex-col items-center gap-6 text-center">
          <div className="relative flex h-14 w-14 items-center justify-center">
            <span
              className="absolute inset-0 rounded-full border-2 border-indigo-200/60 dark:border-indigo-800/60 motion-safe:animate-ping"
              aria-hidden
            />
            <span
              className="absolute inset-1 rounded-full border-2 border-transparent border-t-indigo-600 motion-safe:animate-spin dark:border-t-indigo-400"
              aria-hidden
            />
            <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white dark:bg-indigo-500">
              {activeStep + 1}
            </span>
          </div>

          <ol className="flex w-full max-w-xs items-center justify-between gap-1">
            {steps.map((label, index) => {
              const isComplete = index < activeStep;
              const isActive = index === activeStep;
              return (
                <li key={label} className="flex flex-1 flex-col items-center gap-2">
                  <span
                    className={[
                      "flex h-2 w-2 rounded-full transition-colors duration-200",
                      isComplete
                        ? "bg-indigo-600 dark:bg-indigo-400"
                        : isActive
                          ? "bg-indigo-500 motion-safe:animate-pulse dark:bg-indigo-400"
                          : "bg-zinc-300 dark:bg-zinc-700",
                    ].join(" ")}
                    aria-hidden
                  />
                  <span
                    className={[
                      "text-center text-[10px] leading-tight font-medium sm:text-xs",
                      isActive
                        ? "text-zinc-900 dark:text-zinc-50"
                        : "text-zinc-400 dark:text-zinc-500",
                    ].join(" ")}
                  >
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>

          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              {steps[activeStep]}
              {phase === "sending_verification" && email ? (
                <span className="block text-xs font-normal text-default-500">{email}</span>
              ) : null}
            </p>
            <p className="max-w-sm text-xs text-default-500">{description}</p>
          </div>
        </div>
      </div>

      {showCaptcha ? <ClerkCaptchaMount /> : null}
    </div>
  );
}
