#!/usr/bin/env bash
# `docker` que funciona en este WSL: usa el CLI de la integración de Docker
# Desktop y, si está roto (p.ej. SIGBUS tras actualizar Docker Desktop sin
# reiniciar WSL), cae al cliente de Windows docker.exe (mismo daemon).
#   scripts/dev/docker.sh compose -f docker-compose.yml build api
set -euo pipefail

if command -v docker >/dev/null 2>&1 && timeout 15 docker info >/dev/null 2>&1; then
  exec docker "$@"
fi
win="/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe"
if [ -x "$win" ] && timeout 20 "$win" info >/dev/null 2>&1; then
  # docker.exe solo hereda las variables listadas en WSLENV.
  export WSLENV="${WSLENV:+$WSLENV:}DEV_NATS_USER:DEV_NATS_PASS:DEV_REDIS_PORT:DEV_PG_PORT:DEV_NATS_PORT:DEV_MQTT_PORT:DOCKER_BUILDKIT:COMPOSE_PROJECT_NAME"
  exec "$win" "$@"
fi
echo "ERROR: no hay un cliente Docker operativo. Arranca Docker Desktop" >&2
echo "       (o ejecuta 'wsl --shutdown' en Windows si el CLI da SIGBUS)." >&2
exit 1
