"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, Copy, Link2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/clipboard";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

type ShareCopyLinkRowProps = {
  /** App-relative path to the resource, e.g. /drive/<folderId>. */
  href: string;
};

const COPIED_RESET_MS = 2000;

/** The window origin never changes, so there is nothing to subscribe to. */
const NO_OP_SUBSCRIBE = () => () => {};

/**
 * Copy the in-app link to this resource.
 *
 * Not the public link — that is a `public_link` tuple and lands Thursday. This
 * URL only works for people who already have access, which is exactly what the
 * invite list above grants.
 */
export function ShareCopyLinkRow({ href }: ShareCopyLinkRowProps) {
  const [copied, setCopied] = useState(false);

  // window does not exist during the server render, so the origin is read
  // through useSyncExternalStore: it returns "" on the server and the real
  // origin on the client, which keeps hydration consistent without an effect
  // that immediately setStates. The origin never changes, hence the no-op
  // subscribe.
  const origin = useSyncExternalStore(
    NO_OP_SUBSCRIBE,
    () => window.location.origin,
    () => ""
  );
  const absoluteUrl = origin ? new URL(href, origin).toString() : href;

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    if (await copyToClipboard(absoluteUrl)) {
      setCopied(true);
      showSuccessToast("Link copied");
      return;
    }
    showErrorToast(new Error("Couldn't copy the link. Copy it from the box instead."));
  };

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-md border p-3">
      <Link2 className="text-muted-foreground size-4 shrink-0" aria-hidden />

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Link to this item</p>
        {/* Selectable, so copy still works when the clipboard API is blocked. */}
        <p className="text-muted-foreground truncate text-xs" title={absoluteUrl}>
          {absoluteUrl}
        </p>
      </div>

      <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copied ? "Copied" : "Copy link"}
      </Button>
    </div>
  );
}
