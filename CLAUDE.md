# Domotic AI — guía para Claude

Plataforma de domótica multi-casa: NestJS monorepo (pnpm) + Prisma 7 / TimescaleDB +
Redis + NATS + MQTT (TBMQ en producción) + React 19 (web/) + stacks de cliente
(stack-client/) que corren en la Orange Pi del cliente.

## Mapa

| Ruta | Qué es |
|---|---|
| `apps/api` | REST + SSE + OAuth (Google/MS/GitHub) + MCP server + Alexa + pricing. HTTP `API_PORT`, prefijo `/api/v1` |
| `apps/mqtt-core` | Ingesta MQTT `home/id/+/+/#`, registro de dispositivos, publicación de comandos, bundle edge |
| `apps/rules-engine` | Reglas, schedules (BullMQ), watchdog. Sin MQTT: manda comandos por NATS a mqtt-core |
| `apps/appliance-monitor` | Máquina de estados de electrodomésticos (casas sin edge) |
| `apps/ai-service` | Agentes Mastra por organización (NATS `ai.generate`) |
| `apps/integrations` | Puente xiaozhi (WebSocket MCP) |
| `apps/init` | Warm-up de caché, sondeo de conexión TBMQ, dedup de `sensor_data` |
| `libs/models` | DTOs + **protocol adapters** (zigbee, hadiscovery…) |
| `libs/rules-evaluator` | Lógica PURA de reglas (compartida con el edge vía vendor-copy) |
| `libs/ai-tools` | 20 tools compartidas por agente Mastra, MCP server y xiaozhi |
| `web/` | SPA React (proyecto pnpm propio). i18n en/es/fr obligatorio |
| `stack-client/edge/rules-engine`, `stack-client/lan-bridge` | Proyectos **independientes** (su propio package.json) |
| `prisma/` | Schema + migraciones (TimescaleDB: hypertables, caggs, jobs) |
| `docs/superpowers/specs`, `docs/superpowers/plans` | Specs y planes aprobados (metodología) |

## Comandos

```bash
make verify                 # rápido: typecheck backend + jest + typecheck web + vendor drift
make verify-full            # = CI: además build de las 7 apps, build web, tsc+tests de stack-client
pnpm exec tsc --noEmit -p tsconfig.json   # typecheck de todo apps/ + libs/
pnpm test <ruta>            # tests: jest con --experimental-vm-modules (NestJS 12 es ESM,
                            # Node >= 24.9). ts-jest NO tipa: ejecuta también tsc
pnpm exec nest build <app>  # build webpack de una app
pnpm -C web exec tsc -b && pnpm -C web exec vite build
pnpm exec prisma generate   # tras cambiar schema.prisma o al clonar (generated/ está en .gitignore)
```

Entorno local aislado (detalles en `docs/development.md` y skill `local-stack`):
`make dev-up` → `make dev-db` → `make dev-api` / `dev-core` / `dev-rules` → `make dev-session`.
Imágenes Docker reales contra ese stack: `make docker-build` → `make docker-up`.

Runtime: **Node 24** (local `.nvmrc`, Docker `node:24.22.2-bookworm-slim`/`-alpine`, CI).
pnpm 10.25 vía corepack (`packageManager`).

## Reglas duras (no negociables)

1. **Nunca producción desde local.** `.env` puede apuntar al broker/TBMQ de producción.
   Para ejecutar apps usa SIEMPRE `scripts/dev/run.sh` / `make dev-*` (cargan `.env.dev`
   con guardas). No ejecutes `make all`/`pnpm start:dev` con `.env` para probar.
2. **Migraciones Prisma:** jamás `prisma migrate dev`, `migrate reset` ni `db push`
   (TimescaleDB produce drift y Prisma propone RESET = borrar datos). Sigue la skill
   `prisma-migration`. No renombres migraciones ya aplicadas.
3. **Separación cliente/plataforma:** `stack-client/**` no importa `@app/*`. La lógica
   compartida vive en `libs/rules-evaluator` y `libs/models/src/device/protocols` y se
   copia con `stack-client/edge/rules-engine/scripts/vendor-libs.sh`. **Nunca edites
   `stack-client/edge/rules-engine/src/vendor/`** (skill `edge-vendor`).
4. **Multi-tenant:** toda consulta/acción debe acotarse por `organization_id` y, para
   dispositivos, por pertenencia del usuario a la casa (`home.users.some.user_id`).
   Los roles importan: REST de comandos exige MANAGER/ADMIN.
5. **i18n:** todo texto visible en web va a `web/src/i18n/locales/{en,es,fr}`. El lint
   de web falla con literales.
6. **Secretos:** nunca leas/imprimas valores de `.env*`; solo nombres de variables.
   No añadas secretos reales a `.env.example`/`.env.dev.example`.
7. **Redis compartido:** las sesiones (`sess:`) y BullMQ (`bull:`) viven en el mismo
   Redis que la caché. Nunca `FLUSHALL`; usa `CacheService.flushAllExcept`.
8. Commits solo cuando el usuario lo pida; nunca `git push --force` ni a `main` directo.
9. CSRF: con `CORS_ORIGINS` definido, la API rechaza POST/PUT/PATCH/DELETE con un
   `Origin` ajeno (`apps/api/src/security/cross-site-guard.ts`). Endpoints nuevos para
   servidores externos deben llegar sin `Origin` o usar bearer.

El hook `.claude/hooks/guard.mjs` bloquea los errores más probables (ver
`docs/development.md`); es una red de seguridad, no sustituye a estas reglas.

## Metodología (Spec → Plan → TDD → Review → Verify)

| Fase | Skill / agente | Artefacto |
|---|---|---|
| 1. Spec | skill `spec` | `docs/superpowers/specs/AAAA-MM-DD-<slug>-design.md` aprobado por el usuario |
| 2. Plan | skill `plan` | `docs/superpowers/plans/AAAA-MM-DD-<slug>.md` con tareas pequeñas |
| 3. Implementación | skill `tdd` (+ agente `test-writer`) | test rojo → código → verde, tarea a tarea |
| 4. Review | agentes `code-reviewer` y `security-reviewer` (en paralelo) | hallazgos verificados y corregidos |
| 5. Verify | skill `verify` (+ `local-stack` si toca runtime) | evidencia: salida de tsc/jest/build/e2e |

Cambios triviales (typo, una línea) pueden saltarse 1–2, nunca 5.
Definición de hecho: `make verify` verde (`make verify-full` antes de PR) + tests nuevos para el comportamiento nuevo +
i18n completo + sin drift de vendor + resumen honesto de lo que NO se pudo verificar.

## Convenciones

- TypeScript estricto en nulls; Prettier (comillas simples, trailing commas). El repo tiene
  ~990 errores de ESLint históricos: no los aumentes; formatea solo los ficheros que tocas
  si ya estaban formateados (evita diffs de ruido).
- Tests: specs junto al código (`*.spec.ts`), mocks manuales de `DbService`
  (ver `apps/api/src/alexa/oauth/alexa-oauth.service.spec.ts`), lógica pura en funciones
  testeables sin Nest (ver `apps/api/src/alexa/mapping/*`).
- Fallar cerrado: entradas desconocidas → error explícito, nunca un valor por defecto
  peligroso (p.ej. una directiva desconocida jamás debe "desbloquear").
- Backlog y estado del proyecto: `docs/status/`.
