"use client";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

type GatedMenuItemProps = {
  allowed: boolean;
  /** Shown in place of nothing when denied, e.g. "Needs edit access". */
  reason: string;
  onSelect: () => void;
  variant?: "default" | "destructive";
  /** Icon + label, exactly as a plain DropdownMenuItem would take. */
  children: React.ReactNode;
};

/**
 * A menu action the caller may not be allowed to take.
 *
 * Disabled rather than hidden: a card that silently changes shape between
 * viewers gives no hint that anything is missing, and "why can I not rename
 * this?" is a worse question than a greyed row that answers it.
 *
 * The reason is rendered as VISIBLE TEXT inside the item. Radix removes a
 * disabled item from arrow-key and typeahead focus, so an `aria-describedby`
 * hung off it is unreachable in focus mode; putting the reason in the item's
 * own content keeps it in the accessible name and on screen. `title` is a
 * mouse-only extra, never the only carrier.
 *
 * Rejected alternative: leave the item enabled with `aria-disabled` and fire an
 * error toast on select. More announceable, but it invites the click and the
 * toast reads as a failure rather than a constraint.
 */
export function GatedMenuItem({
  allowed,
  reason,
  onSelect,
  variant = "default",
  children,
}: GatedMenuItemProps) {
  return (
    <DropdownMenuItem
      disabled={!allowed}
      variant={variant}
      title={allowed ? undefined : reason}
      // Passed straight through, so a caller's setTimeout(…, 0) dropdown-to-
      // dialog workaround keeps working unchanged.
      onSelect={allowed ? onSelect : undefined}
    >
      {children}
      {allowed ? null : (
        <span className="ml-auto pl-2 text-[10px] text-muted-foreground">
          {reason}
        </span>
      )}
    </DropdownMenuItem>
  );
}
