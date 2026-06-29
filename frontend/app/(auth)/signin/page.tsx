import type { Metadata } from "next";
import { AuthFormCard } from "@/components/auth-form-card";

export const metadata: Metadata = { title: "Sign in" };

export default function SigninPage() {
  return <AuthFormCard mode="signin" />;
}