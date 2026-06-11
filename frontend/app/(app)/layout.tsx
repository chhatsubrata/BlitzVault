"use client";

import { redirect } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { AppShellSkeleton } from "@/components/layout/app-shell-skeleton";

// Authenticated app shell: sidebar + topbar + main content.
// Client-side auth gate for Week 1 (Edge middleware.ts is Wednesday's hard guard):
//  - while Clerk resolves -> skeleton (no spinner flash)
//  - signed out           -> redirect to /signin
//  - signed in            -> render the shell
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return <AppShellSkeleton />;
  }

  if (!isSignedIn) {
    redirect("/signin");
  }

  return (
    <div className="flex h-full min-h-0 flex-1">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar />
        <main className="min-h-0 flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
