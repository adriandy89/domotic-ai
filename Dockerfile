# syntax=docker/dockerfile:1.7
#
# Imágenes del BACKEND (monorepo NestJS). Una imagen por servicio:
#   docker compose build <servicio>      (SERVICE_NAME = api | init | mqtt-core |
#   rules-engine | appliance-monitor | ai-service | integrations)
#
# Targets (los usa docker-compose.yml, no renombrar):
#   prisma-migrate  → `prisma migrate deploy` y termina
#   production      → runtime de un servicio (node dist/apps/$SERVICE_NAME/main)
#
# Node 24 LTS sobre Debian bookworm. (Antes: node 22 sobre bullseye, que está EOL:
# su mirror de seguridad devuelve 404 y `apt-get install openssl` ya fallaba.)
ARG NODE_VERSION=24.22.2

# ── base: Node + pnpm fijado ─────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /usr/src/app
# pnpm = la versión exacta (con hash) de "packageManager" en package.json.
RUN corepack enable
ENV npm_config_store_dir=/pnpm/store
COPY package.json pnpm-lock.yaml ./
RUN corepack install

# ── deps: TODAS las dependencias (prisma CLI, nest CLI, webpack, typescript) ──
# Solo depende de package.json + lockfile → la capa se comparte entre los 7
# servicios y entre builds mientras no cambien las dependencias.
FROM base AS deps
RUN --mount=type=cache,id=domotic-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ── prisma-migrate ───────────────────────────────────────────────────────────
FROM deps AS prisma-migrate
COPY prisma.config.ts ./
COPY prisma ./prisma
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# ── build: compila UN servicio ───────────────────────────────────────────────
FROM deps AS build
COPY . .
# generate no conecta a la BD, pero prisma.config.ts exige una URL.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    pnpm exec prisma generate
ARG SERVICE_NAME
RUN test -n "$SERVICE_NAME" || (echo "Falta --build-arg SERVICE_NAME" >&2 && exit 1)
RUN pnpm exec nest build "$SERVICE_NAME"

# ── prod-deps: solo dependencias de producción (compartido entre servicios) ──
# Los bundles de webpack externalizan node_modules; todos los módulos que
# cargan están en "dependencies" (el cliente Prisma generado va dentro del
# bundle y su runtime/WASM sale de @prisma/client).
FROM base AS prod-deps
RUN --mount=type=cache,id=domotic-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod

# ── production: runtime ──────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS production
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /usr/src/app
ARG SERVICE_NAME
ENV NODE_ENV=production
ENV APP_MAIN_FILE=dist/apps/${SERVICE_NAME}/main
COPY --from=prod-deps --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /usr/src/app/package.json ./package.json
COPY --from=build --chown=node:node /usr/src/app/dist/apps/${SERVICE_NAME} ./dist/apps/${SERVICE_NAME}
USER node
# tini como PID 1: reenvía SIGTERM a node (parada limpia en `docker stop`).
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "exec node ${APP_MAIN_FILE}"]
