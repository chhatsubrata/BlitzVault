"use client";

import { useState } from "react";
import { redirect } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { AppShellSkeleton } from "@/components/layout/app-shell-skeleton";
import { SIGN_IN_ROUTE } from "@/lib/routes";

// Authenticated app shell: sidebar + topbar + main content.
// Client-side auth gate kept as a load-time fallback; the Edge hard guard lives
// in proxy.ts (Next 16's renamed middleware). Here we:
//  - while Clerk resolves -> skeleton (no spinner flash)
//  - signed out           -> redirect to /signin
//  - signed in            -> render the shell
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useUser();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (!isLoaded) {
    return <AppShellSkeleton />;
  }

  if (!isSignedIn) {
    redirect(SIGN_IN_ROUTE);
  }

  return (
    <div className="flex h-full min-h-0 flex-1">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <AppSidebar />
      <MobileSidebar open={mobileNavOpen} onOpenChange={setMobileNavOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar onMenuClick={() => setMobileNavOpen(true)} />
        <main id="main-content" tabIndex={-1} className="min-h-0 flex-1 overflow-auto p-6 outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}
