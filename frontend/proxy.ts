import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { POST_AUTH_REDIRECT, SIGN_IN_ROUTE } from "@/lib/routes";

// Next.js 16 renamed the `middleware` file convention to `proxy`. This runs the
// Clerk auth context on every matched request and hard-guards the authed app
// shell at the edge. The client gate in app/(app)/layout.tsx stays as a
// load-time fallback (defense in depth).
const isProtectedRoute = createRouteMatcher([
    "/drive(.*)",
    "/shared(.*)",
    "/starred(.*)",
    "/trash(.*)",
    "/settings(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
    const { userId } = await auth();
    const { pathname } = request.nextUrl;

    // Root has no marketing page yet: route to the app when authed, else sign-in.
    if (pathname === "/") {
        const target = userId ? POST_AUTH_REDIRECT : SIGN_IN_ROUTE;
        return NextResponse.redirect(new URL(target, request.url));
    }

    if (isProtectedRoute(request) && !userId) {
        return NextResponse.redirect(new URL(SIGN_IN_ROUTE, request.url));
    }
});

export const config = {
    matcher: [
        // Skip Next.js internals and all static files, unless found in search params
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        // Always run for API routes
        '/(api|trpc)(.*)',
    ],
};