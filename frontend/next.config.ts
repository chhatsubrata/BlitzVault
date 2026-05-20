import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

// BlitzVault has separate pnpm lockfiles in frontend/ and backend/. Without this,
// Turbopack can walk up and treat the repo root as the project root, then fail
// with "Next.js package not found" because next lives in frontend/node_modules.
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
