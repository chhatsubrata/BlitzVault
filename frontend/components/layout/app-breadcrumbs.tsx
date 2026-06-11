"use client";

import { usePathname } from "next/navigation";
import { labelForPath } from "./nav-items";

// Skeleton breadcrumb trail derived from the pathname. For now it shows the
// top-level section only; nested folder segments arrive with the drive feature.
export function AppBreadcrumbs() {
  const pathname = usePathname();
  const label = labelForPath(pathname) ?? "BlitzVault";

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-2 text-sm text-muted-foreground">
        <li className="truncate font-medium text-foreground" aria-current="page">
          {label}
        </li>
      </ol>
    </nav>
  );
}
