import { Crown, Eye, Pencil } from "lucide-react";
import { cva } from "class-variance-authority";

import { cn } from "@/lib/cn";
import type { AccessRole } from "@/features/sharing/types";

/**
 * The caller's role on a drive item, as a small pill on the card.
 *
 * Feature-local rather than a components/ui primitive: the role domain, icon
 * mapping and copy are all sharing-specific, and ui/ is a vendored shadcn
 * subset. Promote the visual shell if a second consumer appears.
 */

const permissionBadgeVariants = cva(
  "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 " +
    "text-[10px] font-medium leading-none [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      role: {
        owner: "border-primary/30 bg-primary/10 text-primary",
        editor: "border-border bg-accent text-accent-foreground",
        viewer: "border-border bg-muted text-foreground/70",
      },
    },
    // Least privilege: an unknown role must never render as "Owner".
    defaultVariants: { role: "viewer" },
  }
);

const ROLE_ICONS = {
  owner: Crown,
  editor: Pencil,
  viewer: Eye,
} as const;

/**
 * Also used to fold the role into a card's aria-label, so a screen reader gets
 * it in one announcement rather than as a trailing text node.
 */
export const ACCESS_ROLE_LABELS: Record<AccessRole, string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
};

type PermissionBadgeProps = {
  role: AccessRole;
  className?: string;
};

export function PermissionBadge({ role, className }: PermissionBadgeProps) {
  const Icon = ROLE_ICONS[role];

  return (
    // Non-interactive: no tabIndex, so it never adds a stop inside the grid's
    // roving tabindex. The visible label carries the meaning, so the role is
    // never communicated by color alone.
    <span
      data-slot="permission-badge"
      className={cn(permissionBadgeVariants({ role }), className)}
    >
      <Icon aria-hidden />
      {ACCESS_ROLE_LABELS[role]}
    </span>
  );
}
