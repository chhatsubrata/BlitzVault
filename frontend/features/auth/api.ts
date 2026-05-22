import { fetcher } from "@/lib/fetcher";
import type { SyncUserResponse } from "@/features/auth/types";

export const syncAuthenticatedUser = async (
  token: string
): Promise<SyncUserResponse> =>
  fetcher<SyncUserResponse>("/auth/sync", {
    method: "POST",
    token,
  });
