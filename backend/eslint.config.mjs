import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

// Flat config for the Node/Express backend. Type-aware linting is intentionally
// left off here (CI runs `typecheck` separately); this catches lint-class issues.
export default tseslint.config(
  {
    // Build output and deps — never lint.
    ignores: ["dist/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // Allow underscore-prefixed intentional discards (e.g. destructure-omit).
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
);
