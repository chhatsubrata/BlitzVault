# Multi-stage image for the BlitzVault backend (API + BullMQ worker share it).
# Build:  docker build -t blitzvault-backend .
# Run:    docker run --rm -p 5001:5001 --env-file .env.local blitzvault-backend
# Worker: docker run --rm --env-file .env.local blitzvault-backend pnpm worker:start

# ── Build stage: full deps + TypeScript compile ──────────────────────────────
FROM node:20-alpine AS build

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ── Runtime stage: prod deps only, non-root ──────────────────────────────────
FROM node:20-alpine AS runtime

# Patch fixable CVEs in the base OS packages (Trivy gate scans this image).
RUN apk update && apk upgrade --no-cache

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

ENV NODE_ENV=production

# Production dependencies only — drops typescript, eslint, vitest, swc, etc.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Compiled output from the build stage (dist/server.js + dist/src/**).
COPY --from=build /app/dist ./dist

# Drop root: run as the built-in unprivileged `node` user (uid 1000).
RUN chown -R node:node /app
USER node

EXPOSE 5001

# Liveness probe (no DB dependency) via BusyBox wget, present in node:*-alpine.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:5001/healthz || exit 1

# API entrypoint. The worker uses the same image with `pnpm worker:start`
# (node dist/src/workers/index.js) — see docker-compose.dev.yml.
CMD ["node", "dist/server.js"]
