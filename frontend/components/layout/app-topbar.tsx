"use client";

import { UserButton } from "@clerk/nextjs";
import { AppBreadcrumbs } from "./app-breadcrumbs";

// Top bar: breadcrumbs on the left, account control on the right.
// Owns the UserButton inside the shell (the public AuthHeader is hidden here).
export function AppTopbar() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-background px-4">
      <AppBreadcrumbs />
      <UserButton />
    </header>
  );
}
