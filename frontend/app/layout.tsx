import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthSync } from "./auth-sync";
import { FetcherSmoke } from "./fetcher-smoke";
import { Providers } from "./providers";
import { AuthHeader } from "@/components/auth-header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "BlitzVault",
    template: "%s | BlitzVault",
  },
  description: "Modern cloud storage and collaboration platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ClerkProvider
          afterSignOutUrl="/signin"
          signInUrl="/signin"
          signUpUrl="/signup"
        >
          <Providers>
            <AuthHeader />
            <AuthSync />
            <FetcherSmoke />
            {children}
          </Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}
