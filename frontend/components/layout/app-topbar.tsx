"use client";

import { UserButton } from "@clerk/nextjs";
import { Menu } from "lucide-react";
import { AppBreadcrumbs } from "./app-breadcrumbs";

// Top bar: hamburger (mobile) + breadcrumbs on the left, account control right.
// Owns the UserButton inside the shell (the public AuthHeader is hidden here).
export function AppTopbar({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-background px-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open navigation"
          className="-ml-1 rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <AppBreadcrumbs />
      </div>
      <UserButton />
    </header>
  );
}
