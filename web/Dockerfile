# syntax=docker/dockerfile:1.7
# SPA (React + Vite) servida por nginx.
#   docker compose build domotic-web   (contexto = web/)
# VITE_API_URL se lee de web/.env en el build (se incluye en el contexto a
# propósito; ver .dockerignore). APP_VERSION (opcional) fija el id de versión
# que usa la detección de actualizaciones; sin git en la imagen, por defecto es
# un timestamp.
ARG NODE_VERSION=24.22.2

# ── build ────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
# pnpm fijado (web/ no declara packageManager): misma versión que el monorepo.
RUN corepack enable && corepack prepare pnpm@10.25.0 --activate
ENV npm_config_store_dir=/pnpm/store
COPY package.json pnpm-lock.yaml ./
# Instalación reproducible desde el lockfile (antes: `npm install` sin lockfile).
RUN --mount=type=cache,id=domotic-web-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile
COPY . .
ARG APP_VERSION
ENV APP_VERSION=${APP_VERSION}
RUN pnpm run build

# ── runtime ──────────────────────────────────────────────────────────────────
FROM nginx:1.30.6-alpine AS production
COPY ./nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
