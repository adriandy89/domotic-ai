# Standalone edge rules engine. Build context = this directory (self-contained;
# the pure logic is already vendored under src/vendor). No monorepo needed.

# ── build ────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
# Toolchain for the better-sqlite3 native addon.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
# prebuild's vendor step no-ops outside the monorepo (committed src/vendor is used).
RUN pnpm run build

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS production
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
# schema.sql is read at runtime next to the compiled service.
COPY src/store/schema.sql ./dist/store/schema.sql
CMD ["node", "dist/main.js"]
