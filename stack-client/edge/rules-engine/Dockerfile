# Standalone edge rules engine. Build context = this directory (self-contained;
# the pure logic is already vendored under src/vendor). No monorepo needed.
#
# Dos etapas a propósito: la de build es la ÚNICA que ve el toolchain nativo, así
# la imagen final contiene solo producción (dist + node_modules podado) y el
# addon de better-sqlite3 se compila una sola vez en todo el build.

# ── build ────────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
# Toolchain for the better-sqlite3 native addon. Se queda en esta etapa: nunca
# llega a la imagen final.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
# prebuild's vendor step no-ops outside the monorepo (committed src/vendor is used).
RUN pnpm run build
# Deja node_modules listo para producción SIN reinstalar: quita las devDeps y
# conserva el better_sqlite3.node ya compilado arriba.
RUN pnpm prune --prod

# ── runtime ──────────────────────────────────────────────────────────────────
# Sin toolchain, sin corepack, sin devDeps: solo el runtime de Node y la app.
FROM node:24-bookworm-slim AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# schema.sql is read at runtime next to the compiled service.
COPY src/store/schema.sql ./dist/store/schema.sql
CMD ["node", "dist/main.js"]
