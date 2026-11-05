---
name: verify
description: Fase 5 de la metodología. Úsala antes de dar por terminada cualquier tarea, antes de proponer un commit/PR o cuando el usuario pregunte si algo funciona. Ejecuta las comprobaciones de domotic-ai adecuadas a lo que se tocó y reporta la evidencia real.
---

# Verificación con evidencia

Nunca digas "hecho" ni "funciona" sin la salida de los comandos. Si algo no se pudo
verificar (hardware real, producción, Alexa real), dilo explícitamente.

## Qué ejecutar según lo tocado

| Tocado | Comandos |
|---|---|
| Cualquier TS de `apps/` o `libs/` | `pnpm exec tsc --noEmit -p tsconfig.json` y `pnpm test --silent` |
| Una app concreta | además `pnpm exec nest build <app>` |
| `prisma/schema.prisma` | `pnpm exec prisma validate && pnpm exec prisma generate` + `make dev-db` (aplica en `domotic_dev`) |
| `web/` | `pnpm -C web exec tsc -b && pnpm -C web exec vite build` y `pnpm -C web exec eslint <ficheros>` |
| `libs/rules-evaluator` o `libs/models/src/device/protocols` | re-vendor + `cd stack-client/edge/rules-engine && bash scripts/check-vendor-drift.sh && pnpm test` |
| `stack-client/*` | `cd stack-client/<proyecto> && pnpm exec tsc --noEmit && pnpm test` |
| Runtime (MQTT/NATS/BullMQ/OAuth/Alexa) | skill `local-stack` + e2e (`make dev-alexa-e2e`, curl con `make dev-session`) |

Todo junto (lo mismo que la CI): `make verify`.

## Calidad (no bloqueante, pero no empeorar)

- Lint de los ficheros tocados: `pnpm exec eslint <ficheros>` (hay ~990 errores
  históricos en el repo; no añadas nuevos en lo que tocas).
- Prettier solo en ficheros que ya estaban formateados: `pnpm exec prettier --check <f>`.

## Informe final

- Comandos ejecutados y su resultado (nº de tests, errores de tipos = 0, build OK).
- Lo que NO se verificó y por qué.
- Diff resumido (`git diff --stat`). No hagas commit salvo que el usuario lo pida.
