"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Download,
  File as FileIcon,
  Folder as FolderIcon,
  LinkIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadBlob } from "@/features/drive/api";
import { PermissionBadge } from "@/features/sharing/components/permission-badge";
import {
  PUBLIC_DOWNLOAD_TTL_MS,
  usePublicLinkResolution,
} from "@/features/sharing/hooks/use-public-link-resolution";
import type { AccessRole } from "@/features/sharing/types";
import { isApiError } from "@/lib/api-error";
import { showErrorToast } from "@/lib/toast";

const KB = 1024;
const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

// Same formatting as the drive card. Duplicated rather than exported from
// drive-item-card.tsx, which is a component module — a shared formatter can be
// lifted the moment a third caller wants it.
function formatBytes(bytes: string): string {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const i = Math.min(Math.floor(Math.log(n) / Math.log(KB)), UNITS.length - 1);
  const value = n / KB ** i;
  return `${i === 0 ? value : value.toFixed(1)} ${UNITS[i]}`;
}

/** Refresh the presign this far before it expires, rather than after. */
const REFRESH_MARGIN_MS = 60_000;

// A public link always grants viewer. Held in a const because PermissionBadge's
// prop is named `role`, and jsx-a11y reads a literal there as an ARIA role.
const PUBLIC_LINK_ROLE: AccessRole = "viewer";

/**
 * What an anonymous visitor sees at /l/<token>.
 *
 * Never renders AccessDenied: this visitor never had access to lose, and every
 * failure the server can report collapses to one indistinguishable 404 by
 * design (so the endpoint cannot be used to probe which tokens existed). The
 * copy therefore has to cover all of those causes honestly at once.
 */
export function PublicLinkView({ token }: { token: string }) {
  const query = usePublicLinkResolution(token);
  const [progress, setProgress] = useState<number | null>(null);

  if (query.isLoading) {
    return (
      <Card aria-busy role="status">
        <CardContent className="gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
          <span className="sr-only">Opening shared link…</span>
        </CardContent>
      </Card>
    );
  }

  if (query.isError) {
    const rateLimited = isApiError(query.error) && query.error.status === 429;
    return (
      <UnavailableLink
        title={rateLimited ? "Too many attempts" : "This link isn't available"}
        description={
          rateLimited
            ? "Wait a minute, then refresh the page."
            : "The link may have been turned off, it may have expired, or the file may have been deleted."
        }
      />
    );
  }

  const link = query.data;
  if (!link) return null;

  const download = async () => {
    // The presigned URL lives 300s. A tab left open past that has a dead URL,
    // so re-resolve before spending the click rather than after it fails.
    const isStale =
      Date.now() - query.dataUpdatedAt > PUBLIC_DOWNLOAD_TTL_MS - REFRESH_MARGIN_MS;
    const url = isStale
      ? (await query.refetch()).data?.downloadUrl
      : link.downloadUrl;

    if (!url) {
      showErrorToast(new Error("This link isn't available any more."));
      return;
    }

    setProgress(0);
    try {
      const blob = await downloadBlob(url, setProgress);
      // Saved through a same-origin object URL: the `download` attribute is
      // ignored cross-origin, and the file would land under a storage key.
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = link.file?.name ?? "download";
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      showErrorToast(error);
      // Last resort: let the browser fetch it directly.
      window.open(url, "_blank", "noopener");
    } finally {
      setProgress(null);
    }
  };

  const isDownloading = progress !== null;

  if (link.kind === "folder" && link.folder) {
    return (
      <ResourceCard
        icon={<FolderIcon className="size-8 text-primary" aria-hidden />}
        name={link.folder.name}
        meta="Folder"
      >
        {/* Honest about the gap: the resolve endpoint returns the folder, and
            there is no endpoint yet that lists what is inside it. */}
        <p className="text-xs text-muted-foreground">
          This link shares the folder itself. Browsing its contents isn&rsquo;t
          available yet.
        </p>
      </ResourceCard>
    );
  }

  if (!link.file) return null;

  return (
    <ResourceCard
      icon={<FileIcon className="size-8 text-muted-foreground" aria-hidden />}
      name={link.file.name}
      meta={`${formatBytes(link.file.sizeBytes)} · ${link.file.mime}`}
      thumbnailUrl={link.file.thumbnailUrl}
    >
      <Button type="button" onClick={download} disabled={isDownloading}>
        <Download aria-hidden />
        {isDownloading
          ? `Downloading… ${Math.round((progress ?? 0) * 100)}%`
          : "Download"}
      </Button>
    </ResourceCard>
  );
}

function ResourceCard({
  icon,
  name,
  meta,
  thumbnailUrl,
  children,
}: {
  icon: React.ReactNode;
  name: string;
  meta: string;
  thumbnailUrl?: string | null;
  children: React.ReactNode;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const showThumbnail = Boolean(thumbnailUrl) && !imgFailed;

  return (
    <Card>
      <CardContent className="items-center gap-3 text-center">
        {showThumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote Cloudinary URL, not a local asset
          <img
            src={thumbnailUrl ?? undefined}
            alt={name}
            className="h-40 w-full rounded-md object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          icon
        )}
        <h1 className="truncate text-base font-semibold text-foreground" title={name}>
          {name}
        </h1>
        <span className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{meta}</span>
          <PermissionBadge role={PUBLIC_LINK_ROLE} />
        </span>
        <p className="text-xs text-muted-foreground">Shared with you · view only</p>
        {children}
      </CardContent>
    </Card>
  );
}

function UnavailableLink({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="flex flex-col items-center gap-3 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-accent">
        <LinkIcon className="size-6 text-muted-foreground" aria-hidden />
      </div>
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      <Button asChild variant="outline">
        <Link href="/">Go to BlitzVault</Link>
      </Button>
    </section>
  );
}
