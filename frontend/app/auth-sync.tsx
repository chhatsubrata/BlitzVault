"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useEffect, useRef } from "react";

const DEFAULT_BACKEND_BASE_URL = "http://localhost:5001";
const AUTH_SYNC_ENDPOINT = "/api/v1/auth/sync";

const getAuthSyncUrl = () => {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
  const baseUrl = configuredBaseUrl || DEFAULT_BACKEND_BASE_URL;
  return `${baseUrl}${AUTH_SYNC_ENDPOINT}`;
};

const isNetworkError = (error: unknown): boolean =>
  error instanceof TypeError && error.message === "Failed to fetch";

export function AuthSync() {
  const { getToken, isLoaded, userId } = useAuth();
  const { isSignedIn } = useUser();
  const syncedUserIdRef = useRef<string | null>(null);

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

    const syncAuthenticatedUser = async () => {
      const syncUrl = getAuthSyncUrl();

      try {
        const token = await getToken();
        if (!token || isCancelled) {
          return;
        }

        const response = await fetch(syncUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          console.error(
            `Failed to sync authenticated user: HTTP ${response.status} from ${syncUrl}`,
          );
          return;
        }

        syncedUserIdRef.current = userId;
      } catch (error) {
        if (isCancelled) {
          return;
        }

        if (isNetworkError(error)) {
          console.error(
            `Failed to sync authenticated user: backend unreachable at ${syncUrl}. ` +
              "Start the API with `cd backend && pnpm dev` and ensure CORS allows this frontend origin.",
          );
          return;
        }

        console.error("Failed to sync authenticated user", error);
      }
    };

    void syncAuthenticatedUser();

    return () => {
      isCancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn, userId]);

  return null;
}
