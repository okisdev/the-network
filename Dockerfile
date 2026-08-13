# syntax=docker/dockerfile:1

# Build stage: install workspace deps (incl. better-sqlite3 native) and build console.
FROM node:22-alpine AS build

RUN apk add --no-cache python3 make g++ \
  && corepack enable \
  && corepack prepare pnpm@11.21.0 --activate

WORKDIR /app

# Manifests first for install layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/hub/package.json apps/hub/
COPY apps/console/package.json apps/console/
COPY packages/schema/package.json packages/schema/
COPY packages/probe-surge/package.json packages/probe-surge/

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm -F @the-network/console build

# Runtime stage: keep the monorepo layout so pnpm workspace symlinks and
# tsx imports of package TypeScript sources resolve.
# Layout choice: copy the full /app tree from build (node_modules + workspace
# packages + hub + console out). Simpler and safer than selective COPY for
# pnpm link integrity.
FROM node:22-alpine AS runtime

WORKDIR /app

COPY --from=build /app /app

ENV NODE_ENV=production \
    TN_PORT=9420 \
    TN_DATA_DIR=/data \
    TN_CONSOLE_DIST=/app/apps/console/out

VOLUME /data
EXPOSE 9420

HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -qO- http://127.0.0.1:9420/health || exit 1

CMD ["/app/apps/hub/node_modules/.bin/tsx", "/app/apps/hub/src/index.ts"]
