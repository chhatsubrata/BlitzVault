import { File as FileIcon, Folder as FolderIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import type { DriveFile, DriveFolder } from "@/features/drive/types";

const KB = 1024;
const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

function formatBytes(bytes: string): string {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const i = Math.min(Math.floor(Math.log(n) / Math.log(KB)), UNITS.length - 1);
  const value = n / KB ** i;
  return `${i === 0 ? value : value.toFixed(1)} ${UNITS[i]}`;
}

type DriveItemCardProps = (
  | { kind: "folder"; item: DriveFolder }
  | { kind: "file"; item: DriveFile }
) & {
  // Fired on click and on Enter/Space — keeps role="button" honest for keyboard
  // users. Optional until the grid wires open/navigate behavior.
  onActivate?: () => void;
};

export function DriveItemCard(props: DriveItemCardProps) {
  const isFolder = props.kind === "folder";
  const Icon = isFolder ? FolderIcon : FileIcon;
  const meta = isFolder
    ? "Folder"
    : `${formatBytes(props.item.sizeBytes)} · ${props.item.mime}`;

  const { onActivate } = props;

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={`${isFolder ? "Folder" : "File"}: ${props.item.name}`}
      onClick={onActivate}
      onKeyDown={(event) => {
        if (!onActivate) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActivate();
        }
      }}
      className={cn(
        "cursor-pointer gap-3 transition-colors hover:bg-accent/50",
        "outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
      )}
    >
      <Icon
        className={cn("size-7", isFolder ? "text-primary" : "text-muted-foreground")}
        aria-hidden
      />
      <CardContent>
        <span className="truncate text-sm font-medium text-foreground" title={props.item.name}>
          {props.item.name}
        </span>
        <span className="truncate text-xs text-muted-foreground">{meta}</span>
      </CardContent>
    </Card>
  );
}
