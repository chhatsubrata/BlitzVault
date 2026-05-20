"use client";

import { Button, Description, Form, Input, Label, TextField } from "@heroui/react";
import Lottie from "lottie-react";
import Link from "next/link";
import signupAnimation from "@/public/lottie/signup.json";
import { googleSvg } from "@/public/svgs/svg";

type AuthMode = "signup" | "signin";

type AuthFormCardProps = {
  mode: AuthMode;
};

const inputClassName = "border border-zinc-200 rounded-medium focus-within:border-zinc-300";

export function AuthFormCard({ mode }: AuthFormCardProps) {
  const isSignup = mode === "signup";

  const title = isSignup ? "Create your account" : "Welcome back";
  const subtitle = isSignup
    ? "Enter your details below to create your account."
    : "Enter your email and password to sign in.";
  const submitLabel = isSignup ? "Create Account" : "Sign In";
  const googleLabel = isSignup ? "Sign up with Google" : "Sign in with Google";
  const alternateText = isSignup ? "Already have an account?" : "Don't have an account?";
  const alternateHref = isSignup ? "/signin" : "/signup";
  const alternateLabel = isSignup ? "Sign in" : "Sign up";

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center px-4 py-4">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="grid overflow-hidden rounded-3xl bg-linear-to-br from-white via-zinc-50 to-indigo-50/80 shadow-[0_20px_60px_-20px_rgba(79,70,229,0.35)] md:grid-cols-2 dark:from-zinc-950 dark:via-zinc-900 dark:to-indigo-950/40 dark:shadow-[0_20px_60px_-20px_rgba(99,102,241,0.35)]">
          <Form className="p-6 md:p-8">
            <div className="flex w-full flex-col gap-6">
              <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="text-2xl font-bold">{title}</h1>
                <p className="text-sm text-default-500">{subtitle}</p>
              </div>

              {isSignup ? (
                <TextField className="w-full" name="username" type="text" isRequired>
                  <Label>Username</Label>
                  <Input placeholder="johndoe" className={inputClassName} />
                </TextField>
              ) : null}

              <TextField className="w-full" name="email" type="email" isRequired>
                <Label>Email</Label>
                <Input placeholder="john@example.com" className={inputClassName} />
                <Description>
                  We&apos;ll use this to contact you. We will not share your email with anyone else.
                </Description>
              </TextField>

              <TextField className="w-full" name="password" type="password" isRequired>
                <Label>Password</Label>
                <Input className={inputClassName} />
                <Description>Must be at least 8 characters long.</Description>
              </TextField>

              <Button type="submit" className="w-full">
                {submitLabel}
              </Button>

              <div className="flex items-center gap-3 text-sm text-default-500">
                <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                <span>Or continue with</span>
                <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
              </div>

              <Button variant="outline" type="button" className="w-full">
                <div className="flex items-center justify-center">
                  <span className="h-6 w-6">{googleSvg}</span>
                  <span>{googleLabel}</span>
                </div>
              </Button>

              <p className="text-center text-sm text-default-500">
                {alternateText}{" "}
                <Link href={alternateHref} className="text-primary underline">
                  {alternateLabel}
                </Link>
              </p>
            </div>
          </Form>

          <div className="relative hidden items-center justify-center bg-linear-to-br from-amber-50 via-rose-50 to-fuchsia-100/80 p-6 md:flex dark:from-zinc-900 dark:via-rose-950/30 dark:to-fuchsia-950/30">
            <Lottie animationData={signupAnimation} loop autoplay className="h-full w-full max-w-md" />
          </div>
        </div>
      </div>
    </div>
  );
}
