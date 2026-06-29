"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/cn";
import { Skeleton } from "@/components/ui/skeleton";
import { useFolderPath } from "@/features/drive/hooks/use-folder-path";

type DriveBreadcrumbsProps = {
  // Current folder (undefined = drive root).
  folderId?: string;
};

const ROOT_LABEL = "My Drive";
const linkClass =
  "truncate rounded-sm px-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none";

export function DriveBreadcrumbs({ folderId }: DriveBreadcrumbsProps) {
  const { data: crumbs, isLoading } = useFolderPath(folderId);

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1 text-sm">
        <li className="flex items-center gap-1">
          {folderId ? (
            <Link href="/drive" className={linkClass}>
              {ROOT_LABEL}
            </Link>
          ) : (
            <span className="px-1 font-medium text-foreground" aria-current="page">
              {ROOT_LABEL}
            </span>
          )}
        </li>

        {folderId && isLoading ? (
          <li className="flex items-center gap-1">
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            <Skeleton className="h-4 w-24" />
          </li>
        ) : null}

        {(crumbs ?? []).map((crumb, index) => {
          const isLast = index === (crumbs?.length ?? 0) - 1;
          return (
            <li key={crumb.id} className="flex min-w-0 items-center gap-1">
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              {isLast ? (
                <span
                  className="truncate px-1 font-medium text-foreground"
                  aria-current="page"
                  title={crumb.name}
                >
                  {crumb.name}
                </span>
              ) : (
                <Link
                  href={`/drive/${crumb.id}`}
                  className={cn(linkClass, "max-w-[12rem]")}
                  title={crumb.name}
                >
                  {crumb.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
