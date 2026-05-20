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
      try {
        const token = await getToken();
        if (!token || isCancelled) {
          return;
        }

        const response = await fetch(getAuthSyncUrl(), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          console.error("Failed to sync authenticated user", response.status);
          return;
        }

        syncedUserIdRef.current = userId;
      } catch (error) {
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
