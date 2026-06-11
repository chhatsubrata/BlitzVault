import { HardDrive, Share2, Star, Trash2, Settings, type LucideIcon } from "lucide-react";

// Single source of truth for the app shell's top-level sections.
// Consumed by the sidebar (links + active state) and breadcrumbs (segment labels).
export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/drive", label: "My Drive", icon: HardDrive },
  { href: "/shared", label: "Shared with me", icon: Share2 },
  { href: "/starred", label: "Starred", icon: Star },
  { href: "/trash", label: "Trash", icon: Trash2 },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

// Route prefixes owned by the authenticated app shell. Used to hide the public
// AuthHeader inside the shell (the shell's own topbar owns the UserButton).
export const APP_ROUTE_PREFIXES: readonly string[] = NAV_ITEMS.map((item) => item.href);

// Map a pathname's first segment to its human label (for breadcrumbs).
export const labelForPath = (pathname: string): string | undefined =>
  NAV_ITEMS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.label;
