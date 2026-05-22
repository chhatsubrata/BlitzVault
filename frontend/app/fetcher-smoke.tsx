"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useRef } from "react";
import { syncAuthenticatedUser } from "@/features/auth/api";
import { isApiError } from "@/lib/api-error";

/**
 * Dev-only smoke: verifies fetcher + POST /api/v1/auth/sync when signed in.
 * Remove or gate behind env before production.
 */
export function FetcherSmoke() {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const testedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    if (!isLoaded || !isSignedIn || !userId) {
      return;
    }

    if (testedUserIdRef.current === userId) {
      return;
    }

    let cancelled = false;

    const runSmoke = async () => {
      try {
        const token = await getToken();
        if (!token || cancelled) {
          return;
        }

        await syncAuthenticatedUser(token);
        testedUserIdRef.current = userId;
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (isApiError(error)) {
          console.error(
            `[FetcherSmoke] sync failed: ${error.code} — ${error.message}`
          );
          return;
        }

        console.error("[FetcherSmoke] sync failed", error);
      }
    };

    void runSmoke();

    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn, userId]);

  return null;
}
