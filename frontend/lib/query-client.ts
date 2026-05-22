import { QueryClient } from "@tanstack/react-query";

export const defaultQueryClientOptions = {
  queries: {
    staleTime: 60000,
    gcTime: 5 * 60000,
  },
};

export const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: defaultQueryClientOptions,
  });
