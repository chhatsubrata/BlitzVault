# Dev skeleton — local development typically uses host `pnpm dev` + compose Postgres.
# Build: docker build -f Dockerfile -t blitzvault-backend:dev .
# Run:   docker run --rm -p 5001:5001 --env-file .env.local blitzvault-backend:dev

FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 5001

CMD ["pnpm", "dev"]
