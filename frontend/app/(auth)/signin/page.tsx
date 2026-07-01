import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFormCard } from "@/components/auth-form-card";

export const metadata: Metadata = { title: "Sign in" };

export default function SigninPage() {
  // AuthFormCard reads useSearchParams (redirect_url) — needs a Suspense
  // boundary to avoid a whole-page CSR bailout at build.
  return (
    <Suspense fallback={<div className="min-h-[calc(100dvh-4rem)]" />}>
      <AuthFormCard mode="signin" />
    </Suspense>
  );
}