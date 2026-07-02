# Multi-stage image for the BlitzVault frontend (Next.js standalone output).
# Build (public Clerk env baked at build time):
#   docker build --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx \
#     -t blitzvault-frontend .
# Run:  docker run --rm -p 3000:3000 blitzvault-frontend

# ── Deps stage: install once, reuse for the build ────────────────────────────
FROM node:20-alpine AS deps

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ── Build stage: compile the app (needs the public Clerk env) ────────────────
FROM node:20-alpine AS build

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

# Public build-time config. Defaults keep the image build secretless (empty
# publishable key) — real values are passed via --build-arg / CI.
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
ARG NEXT_PUBLIC_CLERK_SIGN_IN_URL=/signin
ARG NEXT_PUBLIC_CLERK_SIGN_UP_URL=/signup
ARG NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
ARG NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/
ARG NEXT_PUBLIC_BACKEND_URL=http://localhost:5001

ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_CLERK_SIGN_IN_URL=$NEXT_PUBLIC_CLERK_SIGN_IN_URL
ENV NEXT_PUBLIC_CLERK_SIGN_UP_URL=$NEXT_PUBLIC_CLERK_SIGN_UP_URL
ENV NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=$NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL
ENV NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=$NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# ── Runtime stage: standalone server only, non-root ──────────────────────────
FROM node:20-alpine AS runtime

# Patch fixable CVEs in the base OS packages (Trivy gate scans this image).
RUN apk update && apk upgrade --no-cache

WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Standalone bundle = minimal server.js + only the traced node_modules.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Drop root: run as the built-in unprivileged `node` user (uid 1000).
RUN chown -R node:node /app
USER node

EXPOSE 3000

# Probe a static asset (excluded from Clerk middleware) so liveness never
# depends on runtime Clerk config — `/` needs a valid publishable key to render.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:3000/next.svg || exit 1

CMD ["node", "server.js"]
