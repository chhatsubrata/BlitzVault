"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Globe } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useCreatePublicLink } from "@/features/sharing/hooks/use-create-public-link";
import { useRevokePublicLink } from "@/features/sharing/hooks/use-revoke-public-link";
import type { ShareResourceRef, SharePublicLink } from "@/features/sharing/types";
import { copyToClipboard } from "@/lib/clipboard";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

type SharePublicLinkRowProps = {
  resource: ShareResourceRef;
  /** From the shares query; undefined while it loads, null when there is none. */
  link: SharePublicLink | null | undefined;
  isLoading: boolean;
  /** The shares query failed, so the current state is unknown. */
  disabled?: boolean;
  /** Named in the revoke confirmation so it is clear what is being cut off. */
  resourceName: string;
};

const COPIED_RESET_MS = 2000;

/**
 * Anyone-with-the-link sharing.
 *
 * The URL is rendered exactly as the server sent it (`PUBLIC_APP_URL` + token)
 * rather than rebuilt from window.location.origin: the API owns the canonical
 * public host, and an app served from a second domain must not hand out links
 * pointing at itself. The trade is that PUBLIC_APP_URL is load-bearing in
 * deployment.
 */
export function SharePublicLinkRow({
  resource,
  link,
  isLoading,
  disabled = false,
  resourceName,
}: SharePublicLinkRowProps) {
  const createLink = useCreatePublicLink(resource);
  const revokeLink = useRevokePublicLink(resource);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const isPending = createLink.isPending || revokeLink.isPending;
  // Flip the moment the user asks, and stay flipped while the POST is in
  // flight — a switch that springs back for half a second reads as broken.
  const isOn = Boolean(link) || createLink.isPending;

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleToggle = (next: boolean) => {
    if (next) {
      // Minting is reversible and low-stakes — no confirmation.
      createLink.mutate();
      return;
    }
    // Turning it off is not: the URL may already be circulating, and there is
    // no undo. Ask first.
    setConfirmOpen(true);
  };

  const handleCopy = async () => {
    if (!link) return;
    if (await copyToClipboard(link.url)) {
      setCopied(true);
      showSuccessToast("Link copied");
      return;
    }
    showErrorToast(
      new Error("Couldn't copy the link. Copy it from the box instead.")
    );
  };

  const helpText = createLink.isPending
    ? "Creating link…"
    : revokeLink.isPending
      ? "Turning link off…"
      : isOn
        ? `Anyone with the link can view this ${resource.kind}.`
        : "Only people you invite can open this.";

  return (
    <>
      <div className="grid min-w-0 gap-3 rounded-md border p-3">
        <div className="flex min-w-0 items-start gap-3">
          <Globe className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />

          <div className="min-w-0 flex-1">
            <Label htmlFor="share-public-link">Public link</Label>
            {/* role="status" so flipping the switch is announced — the change
                is in this text, not in the control's own label. */}
            <p
              id="share-public-link-help"
              role="status"
              className="text-xs text-muted-foreground"
            >
              {helpText}
            </p>
          </div>

          <Switch
            id="share-public-link"
            checked={isOn}
            disabled={isLoading || disabled || isPending}
            onCheckedChange={handleToggle}
            aria-describedby="share-public-link-help"
          />
        </div>

        {link ? (
          <div className="flex min-w-0 items-center gap-2">
            <Label htmlFor="share-public-link-url" className="sr-only">
              Public link URL
            </Label>
            {/* A read-only input, not the <p> the in-app link row uses: this URL
                is the whole point of the feature, so it must stay selectable
                when the Clipboard API is blocked or the page is unfocused. */}
            <Input
              id="share-public-link-url"
              readOnly
              value={link.url}
              onFocus={(event) => event.currentTarget.select()}
              className="h-8 min-w-0 flex-1 text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              aria-label="Copy public link"
            >
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        ) : null}

        {/* The mutation toasts too, but a toast is easy to miss behind an open
            dialog, and this is the row the user was looking at. */}
        {createLink.isError ? (
          <p role="alert" className="text-xs text-destructive">
            Couldn&rsquo;t create the link. Try again.
          </p>
        ) : null}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Turn off the public link?</DialogTitle>
            <DialogDescription>
              Anyone who already has this link will stop being able to open
              &ldquo;{resourceName}&rdquo;. Turning it back on creates a
              different link — the current one won&rsquo;t work again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
            >
              Keep link
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                // Optimistic: close immediately and let the mutation roll the
                // switch back with a toast if the server refuses.
                revokeLink.mutate();
                setConfirmOpen(false);
              }}
            >
              Turn off link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
