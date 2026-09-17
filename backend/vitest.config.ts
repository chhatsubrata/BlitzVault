import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// TypeORM entities rely on emitDecoratorMetadata, which esbuild (Vitest's default
// transform) does not emit. unplugin-swc compiles with SWC + decorator metadata
// so entities resolve their column types at runtime.
export default defineConfig({
    plugins: [
        swc.vite({
            jsc: {
                target: "es2020",
                parser: { syntax: "typescript", decorators: true },
                transform: { legacyDecorator: true, decoratorMetadata: true },
            },
        }),
    ],
    test: {
        globals: true,
        environment: "node",
        include: ["tests/**/*.test.ts"],
        setupFiles: ["tests/setup.ts"],
        // The suite must not depend on the developer's .env.local. A machine
        // with FGA_ENABLED=true would otherwise run every :id route against a
        // live OpenFGA store, where test fixtures have no tuples, and the
        // owner's own requests would 403. Set here rather than in setup.ts
        // because env.ts reads process.env at import time; dotenv does not
        // override an already-set variable, so this wins over .env.local.
        // Tests that need the live path mock the authz service instead.
        //
        // RATE_LIMIT_ENABLED likewise: the limiter keeps its counters in Redis,
        // so on a machine with Redis up the suite throttles itself and a second
        // run inside the same minute fails with 429. CI already sets this false
        // in the job env; setting it here covers lefthook and a bare pnpm test.
        env: { FGA_ENABLED: "false", RATE_LIMIT_ENABLED: "false" },
        testTimeout: 15000,
        hookTimeout: 30000,
        // Integration tests share one Postgres connection — run files serially.
        fileParallelism: false,
    },
});
