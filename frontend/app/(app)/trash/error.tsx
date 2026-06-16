"use client";

import { RouteError } from "@/components/route-error";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <RouteError error={error} onRetry={unstable_retry} />;
}
