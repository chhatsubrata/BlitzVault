"use client";

import { Globe } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/**
 * Anyone-with-the-link sharing.
 *
 * Disabled on purpose this week. The public-link response shape is frozen
 * (SharePublicLink: token/role/url) but the REQUEST shape is not — it changes
 * when password and expiry land — so features/sharing/api.ts deliberately has
 * no create/revoke, and the mock always returns publicLink: null. Wiring a
 * switch now would mean inventing a token and a URL client-side, and the copy-
 * link affordance would then be built against a fabricated address.
 *
 * Week 3 Thursday owns the real panel (create / copy / revoke); it replaces the
 * body of this file and nothing else.
 */
export function SharePublicLinkRow() {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-md border p-3">
      <Globe className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />

      <div className="min-w-0 flex-1">
        <Label htmlFor="share-public-link">Public link</Label>
        {/* Visible, not sr-only: a disabled switch is not focusable, so a
            screen-reader user in focus mode would never reach an
            aria-describedby tied to it. */}
        <p id="share-public-link-help" className="text-xs text-muted-foreground">
          Anyone-with-the-link sharing arrives later this week.
        </p>
      </div>

      <Switch
        id="share-public-link"
        checked={false}
        disabled
        aria-describedby="share-public-link-help"
      />
    </div>
  );
}
