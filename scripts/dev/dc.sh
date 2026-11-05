#!/usr/bin/env bash
# docker compose del stack local de INFRA (stack-docker + overlay dev).
# Uso: scripts/dev/dc.sh up -d | ps | logs -f mosquitto | stop
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Credenciales NATS del overlay dev = las de .env.dev (si existe).
if [ -f "$ROOT/.env.dev" ]; then
  DEV_NATS_USER="$(grep -E '^NATS_USER=' "$ROOT/.env.dev" | cut -d= -f2- | tr -d '"' || true)"
  DEV_NATS_PASS="$(grep -E '^NATS_PASS=' "$ROOT/.env.dev" | cut -d= -f2- | tr -d '"' || true)"
  export DEV_NATS_USER DEV_NATS_PASS
fi

cd "$ROOT/stack-docker"
exec "$ROOT/scripts/dev/docker.sh" compose -p stack-domotic \
  -f docker-compose.yml -f docker-compose.dev.yml "$@"
