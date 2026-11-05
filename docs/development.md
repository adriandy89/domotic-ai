# Desarrollo local y metodología con IA

## 1. Entorno local aislado

Objetivo: probar todo (API, MQTT, reglas, Alexa, IA) sin tocar producción ni tus
datos de desarrollo existentes.

| Pieza | Dónde | Notas |
|---|---|---|
| Infra | `stack-docker/docker-compose.yml` + `docker-compose.dev.yml` | Proyecto compose `stack-domotic`, volúmenes `stack-domotic_*` (los de siempre) |
| Postgres/Timescale | `127.0.0.1:5433` | BD de pruebas **`domotic_dev`** + `mastra_dev` (pgvector). Tu BD `domotic` no se toca |
| Redis | `127.0.0.1:6380` | El 6379 del host suele ser de otro proyecto |
| NATS | `127.0.0.1:4222` | Credenciales de `.env.dev` |
| Mosquitto | `127.0.0.1:1883` | Anónimo, sin persistencia. Sustituye a TBMQ en local |
| Variables | `.env.dev` (gitignored) desde `.env.dev.example` | Cargadas por `scripts/dev/env.sh` |

### Primer arranque

```bash
cp .env.dev.example .env.dev      # y rellena SESSION_SECRET, INTEGRATIONS_ENCRYPTION_KEY,
                                  # EDGE_SIGNING_SECRET (openssl rand -hex 32), NATS_PASS y
                                  # REDIS_PASSWORD (la de stack-docker/docker-compose.yml)
make dev-up                       # infra
make dev-db                       # crea domotic_dev/mastra_dev y aplica migraciones
make dev-session                  # seed + cookie de sesión (imprime JSON)
make dev-api                      # y en otras terminales: dev-core, dev-rules, dev-init…
pnpm -C web dev                   # front en http://localhost:5173 (VITE_API_URL → :3003)
```

### Por qué es seguro

`scripts/dev/env.sh` **vacía todas las claves de `.env`** (que puede apuntar al broker
de producción) y carga `.env.dev`. Después valida parseando las URLs (host exacto) y
aborta —también cuando se usa con `source`— si BD, Redis, NATS, MQTT, la API de TBMQ o
`PUBLIC_APP_URL` no son `localhost`, si Redis no es el del overlay (6380), si las BDs no
terminan en `_dev`, o si hay credenciales de email/Telegram. Así una app lanzada con
`make dev-*` / `scripts/dev/run.sh` no puede:

- se conecte a `mqtt.domotic-ai.com` con el client-id de producción (expulsaría al
  mqtt-core real y mandaría comandos a dispositivos reales);
- cree/borre credenciales en TBMQ al crear/borrar casas;
- envíe emails reales o robe el webhook del bot de Telegram.

> ⚠️ `make all` / `pnpm start:dev <app>` siguen usando `.env`. No los uses para pruebas
> (el hook de guarda los bloquea para Claude). Un túnel SSH a producción en un puerto
> local pasaría las guardas: no lo combines con `.env.dev`.

### Imágenes Docker del backend (Node 24)

Para probar las imágenes reales (las mismas que se despliegan) contra el stack local:

```bash
make dev-up                # infra (crea la red domotic-network)
make docker-build          # prisma-migrate + 7 servicios (Node 24.22, deps de prod)
make docker-up             # genera .env.docker.dev desde .env.dev, migra y arranca
make docker-ps             # estado;  make docker-logs S=api
make dev-alexa-e2e         # el mismo e2e, ahora contra la API en contenedor
make docker-down           # elimina los contenedores de prueba (sin volúmenes)
```

`docker-compose.dev.yml` sustituye `.env.local` por `.env.docker.dev` (hosts =
contenedores `timescaledb`, `redis`, `nats`, `domotic-mosquitto`; BD `*_dev`) y solo
publica la API en `127.0.0.1:3003`. `scripts/dev/docker-env.mjs` valida los hosts.

### Login sin OAuth

La app solo tiene login social. `make dev-session` crea `dev@domotic.local` (ADMIN de
"Dev Org", con "Dev Home", una luz y una cerradura zigbee) y escribe una sesión en
Redis firmada con tu `SESSION_SECRET`:

```bash
OUT=$(make -s dev-session 2>/dev/null | tail -1)
COOKIE=$(node -pe "JSON.parse(process.argv[1]).cookie" "$OUT")
curl -s -H "Cookie: $COOKIE" localhost:3003/api/v1/auth/me
```

Para el navegador: pega la cookie `domotic.sh` en `localhost:3003` desde DevTools, o
configura una app OAuth de desarrollo con callback a localhost.

### Alexa end-to-end

```bash
make dev-api      # terminal 1
make dev-core     # terminal 2
make dev-alexa-e2e   # 23 comprobaciones: discovery, control, fallar-cerrado, OAuth, CORS/CSRF
```

### Problemas conocidos (WSL + Docker Desktop)

- `docker` da **SIGBUS**: la integración WSL quedó desfasada tras actualizar Docker
  Desktop. `scripts/dev/dc.sh` usa `docker.exe` automáticamente; el arreglo real es
  `wsl --shutdown` en Windows y volver a abrir.
- Bind mounts fallan con "distro mount service": el overlay ya no usa bind mounts.
- **TimescaleDB PG18**: el volumen debe montarse en `/var/lib/postgresql` (el overlay
  lo hace). El compose base sigue con `/var/lib/postgresql/data` → revisar en servidor.

## 2. Metodología: Spec → Plan → TDD → Review → Verify

Todo está en `CLAUDE.md` (lo lee Claude en cada sesión) y en `.claude/`:

| Tipo | Nombre | Para qué |
|---|---|---|
| Skill | `spec` | Idea → spec aprobado en `docs/superpowers/specs/` |
| Skill | `plan` | Spec → plan por tareas en `docs/superpowers/plans/` |
| Skill | `tdd` | Implementar tarea a tarea con test primero (patrones del repo) |
| Skill | `verify` | Qué comandos ejecutar según lo tocado; evidencia antes de "hecho" |
| Skill | `local-stack` | Este entorno + e2e |
| Skill | `prisma-migration` | Migraciones seguras con TimescaleDB |
| Skill | `edge-vendor` | Cambios en lógica compartida con la Orange Pi |
| Skill | `deps-upgrade` | Actualizar dependencias con restricciones conocidas |
| Agente | `code-reviewer` | Revisión del diff contra las reglas del repo (solo lectura) |
| Agente | `security-reviewer` | Auth, OAuth, tokens, multi-tenant, dispositivos críticos |
| Agente | `test-writer` | Escribe specs jest siguiendo los patrones del repo |
| Hook | `.claude/hooks/guard.mjs` | Red de seguridad: bloquea `migrate dev/reset`, `db push`, `FLUSHALL`, borrar volúmenes, push forzado o a `main`, arrancar apps con `.env`, leer/escribir `.env`, editar `src/vendor/` y `generated/` |
| CI | `.github/workflows/ci.yml` | typecheck + tests + build de todas las apps, web y stack-client (= `make verify-full`) |

Uso típico en Claude Code:

```
/spec quiero dispositivos calculados (virtuales) a partir de otros sensores
/plan docs/superpowers/specs/2026-11-05-computed-devices-design.md
/tdd T1
→ "revisa el diff con code-reviewer y security-reviewer en paralelo"
/verify
```

### Activar el hook de guarda (manual)

Claude no puede escribir su propia configuración, así que añade tú este
`.claude/settings.json` (se commitea, aplica a todo el equipo) y abre `/hooks` una vez
para recargarlo:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Edit|Write|MultiEdit|NotebookEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/guard.mjs\"",
            "timeout": 10,
            "statusMessage": "domotic guard"
          }
        ]
      }
    ]
  },
  "permissions": {
    "allow": [
      "Bash(make verify)",
      "Bash(make dev-*)",
      "Bash(pnpm exec tsc *)",
      "Bash(pnpm exec jest *)",
      "Bash(pnpm exec nest build *)",
      "Bash(pnpm -C web exec tsc *)"
    ],
    "deny": ["Read(./.env)", "Read(./.env.local)"]
  }
}
```

Probar el hook a mano:
`echo '{"tool_name":"Bash","tool_input":{"command":"npx prisma migrate reset"}}' | node .claude/hooks/guard.mjs; echo $?` → `2`.
