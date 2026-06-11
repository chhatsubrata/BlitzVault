"use client";

import { UserButton, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_ROUTE_PREFIXES } from "@/components/layout/nav-items";

const AUTH_ROUTE_PREFIXES = ["/signin", "/signup", "/sso-callback"] as const;

// Routes where the public header must NOT render: auth pages and the
// authenticated app shell (the shell's own topbar owns the UserButton).
const HIDDEN_HEADER_PREFIXES = [...AUTH_ROUTE_PREFIXES, ...APP_ROUTE_PREFIXES] as const;

export function AuthHeader() {
  const pathname = usePathname();
  const { isLoaded, isSignedIn } = useUser();

  if (HIDDEN_HEADER_PREFIXES.some((route) => pathname.startsWith(route))) {
    return null;
  }

  if (!isLoaded) {
    return <header className="flex h-16 items-center justify-end gap-4 p-4" aria-hidden />;
  }

  return (
    <header className="flex h-16 items-center justify-end gap-4 p-4">
      {isSignedIn ? (
        <UserButton />
      ) : (
        <>
          <Link
            href="/signin"
            className="flex h-10 cursor-pointer items-center rounded-full border border-zinc-300 px-4 text-sm font-medium text-zinc-900 sm:h-12 sm:px-5 sm:text-base"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="flex h-10 cursor-pointer items-center rounded-full bg-[#6c47ff] px-4 text-sm font-medium text-white sm:h-12 sm:px-5 sm:text-base"
          >
            Sign Up
          </Link>
        </>
      )}
    </header>
  );
}
