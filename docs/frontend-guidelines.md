# Frontend Guidelines

## Stack

- Next.js 16 App Router.
- React 19.
- TypeScript strict.
- Tailwind 4 + ShadCn UI.
- TanStack Query 5.
- Clerk (`@clerk/nextjs`).
- Zod 4 (shared with backend).
- Lucide icons, Lottie for hero animations only.

## Folder structure

```
frontend/
  app/
    (auth)/
      signin/
      signup/
    (app)/
      layout.tsx               # authed shell: sidebar + topbar
      drive/
        page.tsx
        [...path]/page.tsx
      shared/
      starred/
      trash/
      settings/
    api/                       # route handlers only if BFF needed
    layout.tsx                 # ClerkProvider, Providers
    providers.tsx
    error.tsx
    global-error.tsx
  features/
    files/
      components/
      hooks/
      api.ts                   # fetchers + React Query keys
      types.ts
    folders/
    share/
    workspaces/
    activity/
    search/
  components/
    ui/                        # design-system primitives (Button, Input, ...)
    layout/                    # Sidebar, Topbar, Breadcrumbs
  hooks/
  lib/
    fetcher.ts
    auth.ts
    keyboard.ts
  styles/
```

## Component rules

- **Server Components by default.** Add `'use client'` only when needed (state, effects, events, browser APIs).
- One component per file. Co-locate styles + tests.
- No business logic in components. Hooks + services own logic; components render.
- Props typed explicitly. No `React.FC` (implicit children noise).
- Composition over props explosion. Slot patterns for layout.
- Keep components < 150 LOC; split when bigger.

## Data fetching

- Server Components: fetch directly via `fetch` with Next.js cache primitives or server actions.
- Client Components: TanStack Query.
- Query keys factory per feature: `filesKeys.list(folderId)`, `filesKeys.detail(id)`. Never inline strings.
- Mutations: optimistic update for rename/move/star/delete; rollback on error.
- Default `staleTime: 30_000`, `gcTime: 5_min`. Override per query.

## State

- **Server state** → React Query.
- **URL state** → search params (filters, view mode, selection ranges).
- **Local UI state** → `useState` / `useReducer`.
- **No global store at MVP.** Add Zustand only when proven need (e.g. selection across routes).

## Forms

- React Hook Form + Zod resolver.
- Field-level errors, async validation where useful (name conflict).
- Disable submit while pending; never block on optimistic mutation.

## Styling

- Tailwind utility-first. Custom CSS only for animations or non-utility needs.
- Design tokens via Tailwind config (colors, spacing, radii).
- ShadCn UI for complex primitives (Dialog, Dropdown/Select, Tooltip). Theme aligned to tokens.
- No inline styles except dynamic values (e.g. computed width).
- Dark mode via `class` strategy; system default.

## Accessibility

- Every interactive element keyboard-focusable + visible focus ring.
- Labels on all inputs (visible or `aria-label`).
- Modals trap focus, restore on close.
- `aria-live` for async status (upload progress, toast).
- Respect `prefers-reduced-motion`.
- Color contrast WCAG AA minimum, AAA for body text.

## Keyboard

- `⌘K` command palette (Phase 4).
- Drive list: `j/k` navigate, `↵` open, `⌫` trash, `r` rename, `m` move, `s` star, `⌘D` download, `⌘⇧S` share.
- `?` overlay shows current-context shortcuts.

## Performance

- Avoid client re-renders: stable references, `useMemo` for object props passed deep, `useCallback` for handlers in lists.
- Virtualize lists > 100 items (`@tanstack/react-virtual`).
- Image: `next/image` always; lazy by default.
- Code-split heavy components (PDF viewer, AI panel) via `dynamic()`.
- Track LCP, INP, CLS via Vercel Analytics or Web Vitals reporter.

## Loading / error states

- Skeleton matching final layout (no spinner-only screens).
- Empty state: illustration + primary CTA.
- Error boundary per route segment + global fallback.
- Toast for transient errors; inline for form errors.

## Auth UX

- Clerk modal owned by FE. SSO callback at `/sso-callback`.
- `AuthSync` runs on every login to mirror to backend `/auth/sync`.
- Protect routes via Clerk middleware; redirect to `/signin` on unauthenticated.

## API client

- Single `fetcher` in `lib/fetcher.ts`:
  - Attaches Clerk JWT.
  - Sets `X-Request-Id`.
  - Throws typed `ApiError` on non-2xx (parses error envelope).
- Feature `api.ts` files wrap `fetcher` per endpoint, return typed promises.

## Files / folders

- Drag/drop everywhere (upload zone full route, move between folders, reorder).
- Upload via presigned PUT directly to S3, progress via XHR.
- Optimistic add to list with `pending` badge; reconcile on `complete`.
- Multi-select: shift-range, ⌘-toggle.

## Tests

- Vitest + Testing Library for components.
- Playwright for E2E golden paths.
- MSW for API mocking in component tests.
- Snapshot tests sparingly — only for stable visual primitives.

## Conventions

- File names kebab-case (`file-card.tsx`).
- Component names PascalCase.
- Hook names start `use` and live in nearest `hooks/` folder.
- No default exports for components (named only); default exports OK for Next.js `page.tsx` / `layout.tsx`.

## Don'ts

- No prop drilling > 2 levels — lift to context or compose.
- No business logic in `page.tsx`. Page = layout + data fetch only.
- No direct `localStorage` reads without SSR guard.
- No `useEffect` for data fetching — use React Query or Server Components.
- No emoji in UI copy.
