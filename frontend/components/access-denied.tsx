import type { LucideIcon } from "lucide-react";
import { ShieldAlert } from "lucide-react";

import { cn } from "@/lib/cn";

type AccessDeniedProps = {
  /** Defaults to ShieldAlert; the drive passes FolderX for its 404 variant. */
  icon?: LucideIcon;
  title?: string;
  description?: string;
  /** Usually a "Back to My Drive" button. */
  action?: React.ReactNode;
  className?: string;
};

/**
 * The caller has no access to what they asked for.
 *
 * Shared rather than feature-local: the drive renders it inline (react-query
 * errors never reach a route error.tsx boundary), and RouteError falls back to
 * it for a FORBIDDEN ApiError.
 *
 * Deliberately shaped like DriveEmptyState, not like an error screen — a folder
 * you cannot open is a state of the drive, not a crash. For the same reason it
 * is a plain <section> and NOT role="alert": it is rendered content, not an
 * interruption, and a live region here would talk over the page.
 *
 * No retry affordance by default. A 403 retried is a 403.
 */
export function AccessDenied({
  icon: Icon = ShieldAlert,
  title = "You don't have access",
  description = "You don't have permission to view this. Ask the owner to share it with you.",
  action,
  className,
}: AccessDeniedProps) {
  return (
    <section
      className={cn(
        "flex h-full flex-col items-center justify-center gap-3 text-center",
        className
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-accent">
        <Icon className="size-6 text-muted-foreground" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {action}
    </section>
  );
}
