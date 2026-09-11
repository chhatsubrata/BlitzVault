"use client";

import { useCallback, useEffect, useRef, useTransition, type MouseEvent } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * A click the browser should handle itself: new tab/window, or a non-primary
 * button. Never hijack these — open-in-new-tab must keep working.
 */
const isModifiedClick = (event: MouseEvent<HTMLAnchorElement>): boolean =>
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0;

/**
 * Guarded router navigation.
 *
 * `router.push` is fire-and-forget: clicking a folder card five times queues
 * five identical route transitions, and each one costs an RSC request plus the
 * queries that mount with the new route. Two guards stop that:
 *
 *  - navigating to the route you are already on is a no-op
 *  - a second push to a target already in flight is dropped
 *
 * The in-flight target clears once the pathname actually changes, so a genuine
 * navigate-away-and-back still works.
 *
 * `isNavigating` is React's transition pending flag — use it to disable or
 * busy-mark whatever triggered the navigation.
 */
export function useRouteNavigation() {
    const router = useRouter();
    const pathname = usePathname();
    const [isNavigating, startTransition] = useTransition();
    // Target of the push we have already issued and not yet landed on.
    const pendingHref = useRef<string | null>(null);

    // The route resolved (or the user went elsewhere) — accept pushes again.
    useEffect(() => {
        pendingHref.current = null;
    }, [pathname]);

    const navigate = useCallback(
        (href: string) => {
            if (href === pathname || pendingHref.current === href) {
                return;
            }

            pendingHref.current = href;
            startTransition(() => {
                router.push(href);
            });
        },
        [pathname, router]
    );

    /**
     * Props for a next/link that must not queue duplicate navigations when
     * clicked repeatedly. Spread onto <Link>: the href is kept (so the status
     * bar, right-click menu and modified clicks behave like a real link) while
     * a plain left click goes through the guard instead of the default push.
     */
    const linkProps = useCallback(
        (href: string) => ({
            href,
            onClick: (event: MouseEvent<HTMLAnchorElement>) => {
                if (isModifiedClick(event)) {
                    return;
                }
                event.preventDefault();
                navigate(href);
            },
        }),
        [navigate]
    );

    return { navigate, linkProps, isNavigating };
}
