import type { Metadata } from "next";

import { PublicLinkView } from "@/features/sharing/components/public-link-view";

export const metadata: Metadata = {
  title: "Shared link",
  // The token IS the credential — a crawler that indexes this page publishes it.
  robots: { index: false, follow: false },
};

/**
 * Public-link landing page.
 *
 * Deliberately outside the (app) group: that layout is a client component that
 * redirects anyone signed out, and this page's whole purpose is to work without
 * an account. It is also outside proxy.ts's isProtectedRoute matcher — leave it
 * that way.
 *
 * A shell only, not a data-fetching server component. Resolving the token here
 * would bake the 300-second presigned downloadUrl into the RSC payload, and the
 * resolve endpoint is rate limited per IP: from the server that IP is the
 * deployment, so every visitor in the world would share one 10/min bucket.
 *
 * No generateMetadata for the same reason — titling the tab with the filename
 * would double the rate-limit spend and leak the name of a possibly-revoked
 * file into a server render.
 */
export default async function PublicLinkPage({
  params,
}: {
  // Next 16: route params are async.
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    // The root layout provides no <main> (the (app) layout owns that one), so
    // this page supplies its own landmark.
    <main
      id="main-content"
      className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center p-6"
    >
      <PublicLinkView token={token} />
    </main>
  );
}
