import { describe, expect, it } from "vitest";

import { openApiDocument } from "../../src/shared/openapi/document";
import foldersRouter from "../../src/features/folders/folders.routes";
import filesRouter from "../../src/features/files/files.routes";

// Doc-parity guard: every mounted file/folder route must be documented in the
// OpenAPI spec, and vice versa. Walks the feature routers' own layer stacks —
// Express 5's composed app.router mount layers expose opaque `.matchers` (no
// usable `.path`/`.regexp`), but a router's own stack still yields clean
// `route.path` + `route.methods`. Mount prefixes mirror src/app.ts.

interface RouteLayer {
    route?: { path: string; methods: Record<string, boolean> };
}
interface RouterLike {
    stack: RouteLayer[];
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

const mounts = [
    { prefix: "/api/v1/folders", router: foldersRouter as unknown as RouterLike },
    { prefix: "/api/v1/files", router: filesRouter as unknown as RouterLike },
];

// Express `:param` -> OpenAPI `{param}`; root "/" collapses to the bare prefix.
const toOpenApiPath = (prefix: string, routePath: string): string => {
    const tail = routePath === "/" ? "" : routePath;
    return `${prefix}${tail}`.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
};

type RouteEntry = { method: string; path: string };

const routerRoutes = (): RouteEntry[] => {
    const entries: RouteEntry[] = [];
    for (const { prefix, router } of mounts) {
        for (const layer of router.stack) {
            if (!layer.route) continue; // skip requireAuth `router.use` layer
            const path = toOpenApiPath(prefix, layer.route.path);
            for (const method of HTTP_METHODS) {
                if (layer.route.methods[method]) entries.push({ method, path });
            }
        }
    }
    return entries;
};

const documentedRoutes = (): RouteEntry[] => {
    const entries: RouteEntry[] = [];
    const paths = openApiDocument.paths as Record<string, Record<string, unknown>>;
    for (const [path, operations] of Object.entries(paths)) {
        if (!path.startsWith("/api/v1/folders") && !path.startsWith("/api/v1/files")) continue;
        for (const method of HTTP_METHODS) {
            if (operations[method]) entries.push({ method, path });
        }
    }
    return entries;
};

describe("OpenAPI parity (files + folders)", () => {
    it("documents every mounted file/folder route", () => {
        const documented = new Set(documentedRoutes().map((e) => `${e.method} ${e.path}`));
        const missing = routerRoutes()
            .filter((e) => !documented.has(`${e.method} ${e.path}`))
            .map((e) => `${e.method.toUpperCase()} ${e.path}`);

        expect(missing).toEqual([]);
    });

    it("has no documented file/folder route without a matching handler", () => {
        const mounted = new Set(routerRoutes().map((e) => `${e.method} ${e.path}`));
        const stale = documentedRoutes()
            .filter((e) => !mounted.has(`${e.method} ${e.path}`))
            .map((e) => `${e.method.toUpperCase()} ${e.path}`);

        expect(stale).toEqual([]);
    });
});
