"use client";

import { Toast } from "@heroui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { createQueryClient } from "@/lib/query-client";

type ProvidersProps = {
  children: ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <Toast.Provider placement="bottom end" maxVisibleToasts={3}>
        {children}
      </Toast.Provider>
    </QueryClientProvider>
  );
}
