"use client";

import { SignInButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs";
import { usePathname } from "next/navigation";

const AUTH_ROUTE_PREFIXES = ["/signin", "/signup", "/sso-callback"] as const;

export function AuthHeader() {
  const pathname = usePathname();
  const { isLoaded, isSignedIn } = useUser();

  if (AUTH_ROUTE_PREFIXES.some((route) => pathname.startsWith(route))) {
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
          <SignInButton mode="modal">
            <button
              type="button"
              className="h-10 cursor-pointer rounded-full border border-zinc-300 px-4 text-sm font-medium text-zinc-900 sm:h-12 sm:px-5 sm:text-base"
            >
              Sign In
            </button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button
              type="button"
              className="h-10 cursor-pointer rounded-full bg-[#6c47ff] px-4 text-sm font-medium text-white sm:h-12 sm:px-5 sm:text-base"
            >
              Sign Up
            </button>
          </SignUpButton>
        </>
      )}
    </header>
  );
}
