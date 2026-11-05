---
name: deps-upgrade
description: Úsala para actualizar paquetes npm de domotic-ai (raíz, web/, stack-client/*) de forma segura — patch/minor o majors — en una rama aparte, un commit por grupo y verificando todo. Incluye las restricciones de compatibilidad conocidas (TypeScript, Prisma, Mastra, Nest).
---

# Actualización de dependencias

Cuatro proyectos pnpm independientes, cada uno con su lockfile:
raíz (`package.json`), `web/`, `stack-client/edge/rules-engine`, `stack-client/lan-bridge`.

## Procedimiento

1. Rama aparte: `git checkout -b chore/deps-<area>` (o worktree si hay trabajo en curso).
2. Inventario: `pnpm outdated` (y `pnpm -C web outdated`, etc.).
3. Antes de cada major: `npm view <pkg>@<ver> peerDependencies engines` y su guía de
   migración. Mueve juntos los paquetes acoplados.
   **Antigüedad mínima 7 días** (cadena de suministro): tras cada grupo,
   `node scripts/dev/release-age.mjs` y fija con `pnpm add <pkg>@<versión>` lo que
   proponga para lo demasiado reciente (familias juntas: @nestjs/*, @mastra/*).
4. Orden: (a) todos los patch/minor (`pnpm up`), (b) un major por commit.
5. Tras cada grupo: verificación completa (skill `verify`) + `pnpm exec nest build <app>`
   para TODAS las apps si es la raíz. Si no queda verde con cambios pequeños → revertir
   el grupo y documentar por qué.
6. Commit `chore(deps): <grupo>` con from→to en el cuerpo.
7. Probar en runtime con `local-stack` lo que no cubren los tests (arranque de cada app,
   login, comandos MQTT, IA si hay clave).

## Restricciones conocidas (2026-11)

- **TypeScript ≤ 6.0.x**: ts-jest exige `typescript <7` y typescript-eslint `<6.1.0`;
  @nestjs/cli 12 usa `~6.0.2`. TS 7 (compilador nativo) aún no es viable aquí.
- **Prisma**: el dist-tag `latest` de `prisma` apunta a una RC de la 8 → fija
  `prisma`, `@prisma/client` y `@prisma/adapter-pg` a la MISMA 7.x.
- **Mastra**: `@mastra/memory`/`@mastra/pg`/`mastra` CLI recientes exigen
  `@mastra/core` reciente → subir la familia junta. `@mastra/mcp` 2.x solo habla el
  protocolo MCP 2026-07-28 y desde 2.5 exige zod 4 → mantener 1.x hasta migrar el MCP
  server (`apps/api/src/mcp`) y xiaozhi.
- **zod 4**: requiere cambios (`z.record` de un argumento, `ZodIssueCode`,
  `zod-to-json-schema` en xiaozhi).
- **NestJS 12 es solo ESM** (raíz y stack-client): jest se lanza con
  `node --experimental-vm-modules` → usa SIEMPRE `pnpm test [args]` (no `pnpm exec jest`)
  y Node ≥ 24.9.
- **CLI `mastra`** eliminado (no se usaba y arrastraba `@mastra/deployer` más nuevo que
  `@mastra/core`). Si Mastra pide `MIGRATION_REQUIRED`:
  `pnpm dlx mastra@<versión compatible con @mastra/core> migrate`.
- **Node 24** en todas partes (Dockerfiles, CI, `.nvmrc`) → `@types/node` 24.x.
  `better-sqlite3` (edge) ≥ 12 (la 11 aborta en Node 24); la 13 trae prebuild Node 24
  para x64/arm64 (no armv7). Tras cambiar dependencias, `make docker-build` +
  `make docker-up` + `make dev-alexa-e2e` para probar las imágenes reales.
- **Imágenes Docker**: versiones fijadas (node 24.22.2, nginx 1.30.6, nats 2.15.2).
  `timescaledb:latest-pg18` NO se fija a ciegas: nunca por debajo de la versión de la
  extensión instalada en el servidor.
