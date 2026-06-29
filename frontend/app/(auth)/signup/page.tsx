import type { Metadata } from "next";
import { AuthFormCard } from "@/components/auth-form-card";

export const metadata: Metadata = { title: "Sign up" };

export default function SignupPage() {
  return <AuthFormCard mode="signup" />;
}
