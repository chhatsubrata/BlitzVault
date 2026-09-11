"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav-items";
import { useRouteNavigation } from "@/hooks/use-route-navigation";

// Shared navigation body reused by the desktop rail (AppSidebar) and the mobile
// drawer (MobileSidebar). onNavigate lets the drawer close on link tap.
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { linkProps } = useRouteNavigation();

  // Guarded navigation, with the drawer-close side effect preserved. Modified
  // clicks (new tab) fall through to the browser, so onNavigate still runs but
  // no in-app navigation is triggered.
  const navProps = (href: string) => {
    const { onClick, ...rest } = linkProps(href);
    return {
      ...rest,
      onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
        onNavigate?.();
        onClick(event);
      },
    };
  };

  return (
    <>
      <Link
        {...navProps("/drive")}
        className="mb-3 flex items-center gap-2 px-2 text-lg font-semibold text-sidebar-foreground"
      >
        <Image
          src="/blitzvault-logo.png"
          alt="BlitzVault logo"
          width={28}
          height={28}
          className="shrink-0 rounded-md"
          priority
        />
        <span>BlitzVault</span>
      </Link>

      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            {...navProps(href)}
            aria-current={active ? "page" : undefined}
            className={[
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            ].join(" ")}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </>
  );
}
