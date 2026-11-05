#!/usr/bin/env bash
# Arranca una app Nest contra el stack local aislado (nunca producción).
#   scripts/dev/run.sh api            # nest start --watch api
#   NO_WATCH=1 scripts/dev/run.sh mqtt-core
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP="${1:?uso: run.sh <app> (api|init|mqtt-core|rules-engine|appliance-monitor|ai-service|integrations)}"
cd "$ROOT"
# shellcheck disable=SC1091
source scripts/dev/env.sh
# Muestra destinos SIN credenciales (la salida acaba en logs/contexto de agentes).
_safe() { node -e 'try{const u=new URL(process.argv[1].replace(/^postgresql:/,"postgres:"));console.log(u.host+u.pathname)}catch{console.log("?")}' "$1"; }
echo "▶ $APP con .env.dev (DB=$(_safe "$DATABASE_URL") MQTT=$(_safe "$MQTT_SERVER_BASE"):$MQTT_PORT REDIS=$(_safe "$REDIS_URL"))"
if [ "${NO_WATCH:-}" = "1" ]; then
  exec pnpm exec nest start "$APP"
fi
exec pnpm exec nest start --watch "$APP"
