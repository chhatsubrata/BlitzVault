# Dev skeleton — local development typically uses host `pnpm dev` + compose Postgres.
# Build: docker build -f Dockerfile -t blitzvault-backend:dev .
# Run:   docker run --rm -p 5001:5001 --env-file .env.local blitzvault-backend:dev

FROM node:20-alpine

# Patch fixable CVEs in the base OS packages (Trivy gate scans the image).
RUN apk update && apk upgrade --no-cache

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 5001

CMD ["pnpm", "dev"]
