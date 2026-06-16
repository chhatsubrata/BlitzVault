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
        testTimeout: 15000,
        hookTimeout: 30000,
        // Integration tests share one Postgres connection — run files serially.
        fileParallelism: false,
    },
});
