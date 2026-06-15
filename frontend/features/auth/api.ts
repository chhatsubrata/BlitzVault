import { fetcher } from "@/lib/fetcher";
import { API_CONFIG } from "@/lib/config";
import type { SyncUserResponse } from "@/features/auth/types";

export const syncAuthenticatedUser = async (): Promise<SyncUserResponse> =>
  fetcher<SyncUserResponse>(API_CONFIG.auth.SYNC, {
    method: "POST",
  });
