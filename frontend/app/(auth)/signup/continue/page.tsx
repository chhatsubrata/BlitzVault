"use client";

import { useSignUp } from "@clerk/nextjs/legacy";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateSignupField } from "@/lib/auth-validation";
import { mapClerkErrorToFields } from "@/lib/clerk-errors";
import { POST_AUTH_REDIRECT } from "@/lib/routes";

// Continue an OAuth (e.g. Google) sign-up that Clerk returned as
// `missing_requirements` because our instance requires a username Google can't
// supply. Clerk's AuthenticateWithRedirectCallback redirects here
// (continueSignUpUrl) with the pending `signUp` in client state; we collect the
// missing username, complete the sign-up, and land the user on /drive.
export default function ContinueSignUpPage() {
  const router = useRouter();
  const { isLoaded, signUp, setActive } = useSignUp();

  const [username, setUsername] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Once we start completing the sign-up, setActive clears the pending `signUp`
  // (status -> null). Without this guard the effect below would read that empty
  // state and bounce to /signup before the /drive navigation lands.
  const finishing = useRef(false);

  const finish = useCallback(
    async (createdSessionId: string | null) => {
      if (!setActive || finishing.current) {
        return;
      }
      finishing.current = true;
      await setActive({ session: createdSessionId });
      router.replace(POST_AUTH_REDIRECT);
    },
    [router, setActive],
  );

  // No pending sign-up here -> nothing to continue; send back to /signup.
  // Already complete (nothing was missing) -> activate and go.
  useEffect(() => {
    if (finishing.current || !isLoaded || !signUp) {
      return;
    }
    if (!signUp.status) {
      router.replace("/signup");
      return;
    }
    if (signUp.status === "complete") {
      void finish(signUp.createdSessionId);
    }
  }, [finish, isLoaded, router, signUp]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!isLoaded || !signUp) {
        return;
      }

      const validation = validateSignupField("username", username, {
        username,
        email: "",
        password: "",
      });
      if (validation) {
        setFieldError(validation);
        return;
      }

      setFieldError(undefined);
      setErrorMessage(null);
      setSubmitting(true);

      try {
        const updated = await signUp.update({ username: username.trim() });

        if (updated.status === "complete") {
          await finish(updated.createdSessionId);
          return;
        }

        // OAuth emails are pre-verified, so username should be the only gap. If
        // Clerk still wants more, surface it rather than silently looping.
        setErrorMessage(
          "We still need a bit more to finish sign-up. Please try again or use a different method.",
        );
      } catch (error) {
        const { fieldErrors, primaryMessage } = mapClerkErrorToFields(error);
        if (fieldErrors.username) {
          setFieldError(fieldErrors.username);
        } else {
          setErrorMessage(primaryMessage);
        }
      } finally {
        setSubmitting(false);
      }
    },
    [finish, isLoaded, signUp, username],
  );

  return (
    <div className="mx-auto flex min-h-[60dvh] w-full max-w-sm flex-col justify-center gap-6">
      <div className="flex flex-col gap-1.5 text-center">
        <h1 className="text-xl font-semibold text-foreground">Choose a username</h1>
        <p className="text-sm text-muted-foreground">
          Almost there — pick a username to finish setting up your account.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            name="username"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            onBlur={() =>
              setFieldError(
                validateSignupField("username", username, { username, email: "", password: "" }),
              )
            }
            aria-invalid={Boolean(fieldError)}
            aria-describedby={fieldError ? "username-error" : undefined}
          />
          {fieldError ? (
            <p id="username-error" className="text-sm text-destructive">
              {fieldError}
            </p>
          ) : null}
        </div>

        {errorMessage ? (
          <p className="text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={!isLoaded || submitting}>
          {submitting ? "Finishing…" : "Continue"}
        </Button>
      </form>
    </div>
  );
}
