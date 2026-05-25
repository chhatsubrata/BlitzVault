import { QueryClient } from "@tanstack/react-query";

export const QUERY_STALE_TIME_MS = 30_000;
export const QUERY_GC_TIME_MS = 5 * 60_000;

export const defaultQueryClientOptions = {
  queries: {
    staleTime: QUERY_STALE_TIME_MS,
    gcTime: QUERY_GC_TIME_MS,
  },
};

export const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: defaultQueryClientOptions,
  });
