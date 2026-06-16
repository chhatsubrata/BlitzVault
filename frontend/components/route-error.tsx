"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

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
