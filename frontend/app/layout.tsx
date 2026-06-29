import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
// Bundled Geist fonts (no build-time Google fetch — works offline / in CI).
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { AuthSync } from "./auth-sync";
import { FetcherSmoke } from "./fetcher-smoke";
import { Providers } from "./providers";
import { AuthHeader } from "@/components/auth-header";

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
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
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
