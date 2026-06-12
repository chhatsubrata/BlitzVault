import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
import { POST_AUTH_REDIRECT } from "@/lib/routes";

export default function SSOCallbackPage() {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center text-sm text-muted-foreground">
      <AuthenticateWithRedirectCallback
        signInForceRedirectUrl={POST_AUTH_REDIRECT}
        signUpForceRedirectUrl={POST_AUTH_REDIRECT}
      />
      Completing sign-in...
    </div>
  );
}
