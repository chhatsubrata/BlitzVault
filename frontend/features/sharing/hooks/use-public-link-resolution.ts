import { useQuery } from "@tanstack/react-query";

import { resolvePublicLink } from "@/features/sharing/api";
import { sharingKeys } from "@/features/sharing/keys";
import type { PublicLinkResolution } from "@/features/sharing/public-link-types";

/** How long the server's presigned downloadUrl stays valid. */
export const PUBLIC_DOWNLOAD_TTL_MS = 300_000;

/**
 * Resolve a public-link token for an anonymous visitor.
 *
 * `retry: false` is not a preference. Every failure mode — unknown, revoked,
 * expired, deleted, still scanning — is deliberately the same 404, so a retry
 * can only fail again, and the endpoint allows 10 requests per minute per IP:
 * the default three retries would spend four of them on one page load.
 *
 * staleTime is kept under the presign TTL so a cached resolution never hands
 * out a downloadUrl that has already expired.
 */
export function usePublicLinkResolution(token: string) {
    return useQuery<PublicLinkResolution>({
        queryKey: sharingKeys.link(token),
        queryFn: () => resolvePublicLink(token),
        retry: false,
        refetchOnWindowFocus: false,
        staleTime: PUBLIC_DOWNLOAD_TTL_MS - 60_000,
        gcTime: PUBLIC_DOWNLOAD_TTL_MS,
    });
}
