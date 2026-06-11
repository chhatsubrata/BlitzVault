// Loading skeleton shown while Clerk resolves auth state. Matches the shell
// layout (sidebar rail + topbar + body) so there is no spinner-only flash.
export function AppShellSkeleton() {
  return (
    <div className="flex h-full animate-pulse" aria-hidden>
      <div className="hidden w-60 shrink-0 flex-col gap-2 border-r border-sidebar-border bg-sidebar p-3 md:flex">
        <div className="mb-3 h-6 w-32 rounded bg-muted" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 rounded-md bg-muted" />
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4">
          <div className="h-4 w-32 rounded bg-muted" />
          <div className="h-8 w-8 rounded-full bg-muted" />
        </div>
        <div className="flex-1 p-6">
          <div className="h-32 w-full rounded-lg bg-muted" />
        </div>
      </div>
    </div>
  );
}
