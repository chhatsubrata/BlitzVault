import { SidebarNav } from "./sidebar-nav";

// Desktop left navigation rail. Hidden on narrow screens, where MobileSidebar
// renders the same SidebarNav inside a drawer instead.
export function AppSidebar() {
  return (
    <nav
      aria-label="Primary"
      className="hidden w-60 shrink-0 flex-col gap-1 border-r border-sidebar-border bg-sidebar p-3 md:flex"
    >
      <SidebarNav />
    </nav>
  );
}
