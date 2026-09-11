import { useState } from "react";
import { File as FileIcon, Folder as FolderIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import {
  ACCESS_ROLE_LABELS,
  PermissionBadge,
} from "@/features/sharing/components/permission-badge";
import type { DriveFile, DriveFolder } from "@/features/drive/types";
import type { AccessRole } from "@/features/sharing/types";

const KB = 1024;
const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

function formatBytes(bytes: string): string {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const i = Math.min(Math.floor(Math.log(n) / Math.log(KB)), UNITS.length - 1);
  const value = n / KB ** i;
  return `${i === 0 ? value : value.toFixed(1)} ${UNITS[i]}`;
}

// Roving-tabindex props supplied by useGridKeyboard via getItemProps(). All
// optional so the card still renders standalone (e.g. in a skeleton context).
type RovingProps = {
  tabIndex?: number;
  cardRef?: (node: HTMLElement | null) => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLElement>;
  onFocus?: () => void;
  "data-active"?: "" | undefined;
};

type DriveItemCardProps = (
  | { kind: "folder"; item: DriveFolder }
  | { kind: "file"; item: DriveFile }
) & {
  // Fired on click (and on Enter/Space, handled by the grid keyboard hook).
  onActivate?: () => void;
  // Caller's role on this item. Optional so the card still renders standalone.
  accessRole?: AccessRole;
} & RovingProps;

export function DriveItemCard(props: DriveItemCardProps) {
  const isFolder = props.kind === "folder";
  const Icon = isFolder ? FolderIcon : FileIcon;
  const meta = isFolder
    ? "Folder"
    : `${formatBytes(props.item.sizeBytes)} · ${props.item.mime}`;

  const { onActivate, accessRole, tabIndex, cardRef, onKeyDown, onFocus } = props;
  const [imgFailed, setImgFailed] = useState(false);
  const thumbnailUrl =
    props.kind === "file" ? props.item.thumbnailUrl : null;
  const showThumbnail = Boolean(thumbnailUrl) && !imgFailed;

  return (
    <Card
      ref={cardRef}
      // Only an activatable card (a folder today) is a button. A file card has
      // no activation, so it must not be announced or styled as clickable —
      // its actions live in the menu. Still focusable: the grid's roving
      // tabindex and the Delete shortcut apply to every card.
      role={onActivate ? "button" : undefined}
      tabIndex={tabIndex ?? 0}
      // Role folded in so it reads as one announcement, not a trailing node.
      aria-label={`${isFolder ? "Folder" : "File"}: ${props.item.name}${
        accessRole ? `, ${ACCESS_ROLE_LABELS[accessRole]}` : ""
      }`}
      data-active={props["data-active"]}
      onClick={onActivate}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      className={cn(
        "gap-3 transition-colors hover:bg-accent/50 motion-reduce:transition-none",
        "outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        onActivate && "cursor-pointer"
      )}
    >
      {showThumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote Cloudinary URL, not a local asset
        <img
          src={thumbnailUrl ?? undefined}
          alt={props.item.name}
          loading="lazy"
          className="h-20 w-full rounded-md object-cover"
          // Swap to the file icon (via state) if the thumbnail fails to load.
          onError={() => setImgFailed(true)}
        />
      ) : (
        <Icon
          className={cn("size-7", isFolder ? "text-primary" : "text-muted-foreground")}
          aria-hidden
        />
      )}
      <CardContent>
        <span className="truncate text-sm font-medium text-foreground" title={props.item.name}>
          {props.item.name}
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-xs text-muted-foreground">{meta}</span>
          {accessRole ? <PermissionBadge role={accessRole} /> : null}
        </span>
      </CardContent>
    </Card>
  );
}
