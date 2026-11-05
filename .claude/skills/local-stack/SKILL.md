---
name: local-stack
description: Úsala para levantar, usar o depurar el entorno local AISLADO de domotic-ai (TimescaleDB, Redis, NATS, Mosquitto + apps Nest) y para pruebas end-to-end reales (API con sesión, comandos MQTT, Alexa) sin tocar producción. También cuando Docker falle en WSL.
---

# Stack local aislado

Todo pasa por `scripts/dev/` y el Makefile. Documentación humana: `docs/development.md`.

## Arranque

```bash
make dev-up        # stack-docker + overlay docker-compose.dev.yml (127.0.0.1)
                   # Postgres 5433 · Redis 6380 · NATS 4222 · Mosquitto 1883
make dev-db        # crea domotic_dev + mastra_dev (no toca la BD `domotic`) y migra
make dev-session   # seed (Dev Org, dev@domotic.local ADMIN, Dev Home, luz + cerradura)
                   # → última línea JSON con {cookie, homeUniqueId, lightId, lockId}
                   #   ARGS=--alexa añade cliente Alexa + alexaToken
```

Apps (cada una en su terminal o en background):
`make dev-api`, `dev-core` (mqtt-core), `dev-rules`, `dev-init`, `dev-appliance`,
`dev-ai`, `dev-integrations`, o `make dev-all` (api+core+rules+init).
Sin watch: `NO_WATCH=1 scripts/dev/run.sh <app>`.

Para lanzar en background desde Claude: `(NO_WATCH=1 setsid scripts/dev/run.sh api > <scratchpad>/api.log 2>&1 &)`
y espera a `Nest application successfully started`. Para pararlas, mata por PID
(`ps -eo pid,args | grep 'dist/apps/<app>/main'`); NO uses `pkill -f` con patrones que
coincidan con tu propia shell.

## Seguridad (por qué es aislado)

`scripts/dev/env.sh` vacía todas las claves de `.env` y carga `.env.dev`; aborta si BD,
Redis, NATS, MQTT, TBMQ o `PUBLIC_APP_URL` no son localhost, o si hay credenciales de
email/Telegram. Nunca ejecutes apps con `.env` (puede apuntar al broker de producción:
mqtt-core robaría el client-id de producción y la API podría borrar credenciales TBMQ).

## Imágenes Docker (las que se despliegan) contra el stack local

`make docker-build && make docker-up` (usa `.env.docker.dev`, generado y validado desde
`.env.dev`; API en 127.0.0.1:3003). `make docker-down` al terminar. Para builds/ejecución
puntual: `scripts/dev/docker.sh build|run|logs ...` (elige `docker` o `docker.exe`).

## Pruebas e2e típicas

```bash
OUT=$(make -s dev-session 2>/dev/null | tail -1); COOKIE=$(node -pe "JSON.parse(process.argv[1]).cookie" "$OUT")
curl -s -H "Cookie: $COOKIE" localhost:3003/api/v1/auth/me
make dev-alexa-e2e          # 23 comprobaciones Alexa + CSRF (requiere dev-api + dev-core)
```

Ver lo que llega a los dispositivos (comandos publicados por mqtt-core):
`node -e "const m=require('mqtt').connect('mqtt://127.0.0.1:1883');m.on('connect',()=>m.subscribe('#'));m.on('message',(t,p)=>console.log(t,p+''))"`
Simular telemetría de un dispositivo: publica en
`home/id/<homeUniqueId>/zigbee/<unique_id>` un JSON de estado.

## Problemas conocidos

- **`docker` da SIGBUS en WSL** (Docker Desktop actualizado sin reiniciar WSL):
  `scripts/dev/dc.sh` cae automáticamente a `docker.exe` de Windows. Arreglo definitivo:
  `wsl --shutdown` desde Windows.
- **Bind mounts fallan** ("distro mount service"): por eso el overlay usa
  `configs.content` en vez de montar ficheros.
- **TimescaleDB PG18** debe montar el volumen en `/var/lib/postgresql` (el overlay lo
  hace). El compose base aún monta `/var/lib/postgresql/data`.
- El 6379 del host suele ser de otro proyecto: el dev usa Redis en 6380.
- `MQTT_SERVER_API` apunta a 127.0.0.1:9 a propósito: init registrará errores de TBMQ
  cada minuto; es normal en local.
