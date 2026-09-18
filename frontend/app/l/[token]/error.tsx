"use client";

import { RouteError } from "@/components/route-error";

// Without a boundary here, a client crash on the public route escalates to
// app/global-error.tsx, which replaces the entire document.
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <RouteError error={error} onRetry={unstable_retry} />;
}
