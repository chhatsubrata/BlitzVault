"use client";

import { useEffect } from "react";

import { AccessDenied } from "@/components/access-denied";
import { Button } from "@/components/ui/button";
import { isApiError } from "@/lib/api-error";

// Shared fallback UI for route-segment error boundaries (app/**/error.tsx).
// Next 16 boundaries pass `unstable_retry`; segment files forward it as onRetry.
export function RouteError({
  error,
  onRetry,
}: {
  error: Error & { digest?: string };
  onRetry: () => void;
}) {
  useEffect(() => {
    // Surface the error for local debugging / future reporting hook.
    console.error(error);
  }, [error]);

  // A denial is not a failure, and "Try again" on a 403 only fails again.
  //
  // This only fires where RouteError is rendered directly with a live ApiError
  // (DriveView, TrashView). Through app/**/error.tsx, Next hands over a
  // serialized `Error & { digest }` — the class identity is gone and isApiError
  // is false, so that path correctly falls through to the retry UI below. Do
  // not try to recover the code by string-matching error.message.
  if (isApiError(error) && error.code === "FORBIDDEN") {
    return <AccessDenied />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h2 className="text-xl font-semibold text-foreground">Something went wrong.</h2>
      {error?.message ? (
        <p className="max-w-md text-sm text-muted-foreground">{error.message}</p>
      ) : null}
      <Button type="button" variant="outline" onClick={() => onRetry()}>
        Try again
      </Button>
    </div>
  );
}
