# Standalone LAN device bridge. Build context = this directory (self-contained,
# no monorepo needed). Must run with host networking (or the LAN reachable) so
# SSDP discovery, Wake-on-LAN broadcasts and TV websockets work.
#
# Alpine is fine here (no native addons — pure-JS deps only). The edge
# rules-engine stays on bookworm-slim because better-sqlite3 needs glibc.
ARG NODE_VERSION=24.22.2

# ── build ────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
# pnpm = "packageManager" de package.json vía corepack (antes `npm i -g pnpm`
# sin versión: hoy instalaría pnpm 12 con un lockfile de pnpm 10). El build es
# `tsc`, no hace falta @nestjs/cli global.
RUN corepack enable
# pnpm-workspace.yaml + patches/: parche de androidtv-remote (pnpm patch), que
# se aplica durante el install.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build
# node_modules de producción sin reinstalar (ni pnpm en la imagen final).
RUN pnpm prune --prod

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
CMD ["node", "dist/main.js"]
