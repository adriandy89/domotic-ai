# Standalone LAN device bridge. Build context = this directory (self-contained,
# no monorepo needed). Must run with host networking (or the LAN reachable) so
# SSDP discovery, Wake-on-LAN broadcasts and TV websockets work.
#
# Alpine is fine here (no native addons — pure-JS deps only). The edge
# rules-engine stays on bookworm-slim because better-sqlite3 needs the
# glibc/node-gyp toolchain.


# ── build ────────────────────────────────────────────────────────────────────
FROM node:24.13-alpine AS build
RUN npm install -g pnpm @nestjs/cli
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:24.13-alpine AS production
RUN npm install -g pnpm @nestjs/cli
WORKDIR /app
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
CMD ["node", "dist/main.js"]
