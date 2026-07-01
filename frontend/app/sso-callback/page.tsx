import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
import { POST_AUTH_REDIRECT } from "@/lib/routes";

export default function SSOCallbackPage() {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center text-sm text-muted-foreground">
      <AuthenticateWithRedirectCallback
        // Fallback (not force) so a deep-link `redirectUrlComplete` set when the
        // OAuth flow began still wins; we only default to the drive otherwise.
        signInFallbackRedirectUrl={POST_AUTH_REDIRECT}
        signUpFallbackRedirectUrl={POST_AUTH_REDIRECT}
        // OAuth sign-up missing a required field (e.g. username) -> finish it in
        // our own UI instead of Clerk's hosted Account Portal.
        continueSignUpUrl="/signup/continue"
      />
      Completing sign-in...
    </div>
  );
}
