"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useEffect, useRef } from "react";
import { syncAuthenticatedUser } from "@/features/auth/api";
import { isApiError } from "@/lib/api-error";
import { setTokenGetter } from "@/lib/auth-token";

const isNetworkError = (error: unknown): boolean =>
  error instanceof TypeError && error.message === "Failed to fetch";

export function AuthSync() {
  const { getToken, isLoaded, userId } = useAuth();
  const { isSignedIn } = useUser();
  const syncedUserIdRef = useRef<string | null>(null);

  // Register the token getter once so the fetcher can auth requests itself.
  useEffect(() => {
    setTokenGetter(getToken);
  }, [getToken]);

  useEffect(() => {
    if (!isSignedIn) {
      syncedUserIdRef.current = null;
    }
  }, [isSignedIn]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) {
      return;
    }

    if (syncedUserIdRef.current === userId) {
      return;
    }

    let isCancelled = false;

    const runSync = async () => {
      try {
        const token = await getToken();
        if (!token || isCancelled) {
          return;
        }

        await syncAuthenticatedUser();

        if (!isCancelled) {
          syncedUserIdRef.current = userId;
        }
      } catch (error) {
        if (isCancelled) {
          return;
        }

        if (isApiError(error)) {
          console.error(
            `Failed to sync authenticated user: ${error.status} ${error.code} — ${error.message}`,
          );
          return;
        }

        if (isNetworkError(error)) {
          console.error(
            "Failed to sync authenticated user: backend unreachable. " +
              "Start the API with `cd backend && pnpm dev` and ensure CORS allows this frontend origin.",
          );
          return;
        }

        console.error("Failed to sync authenticated user", error);
      }
    };

    void runSync();

    return () => {
      isCancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn, userId]);

  return null;
}
