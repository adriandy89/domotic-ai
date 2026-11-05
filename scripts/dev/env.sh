#!/usr/bin/env bash
# Carga el entorno de desarrollo AISLADO en la shell actual (source, no exec).
#   source scripts/dev/env.sh || echo "entorno NO cargado"
#
# 1. Vacía (export K=) TODAS las claves definidas en .env: así ninguna variable
#    de .env (que puede apuntar a producción) se cuela vía ConfigModule, que
#    solo rellena las claves que NO existen ya en process.env.
# 2. Carga .env.dev.
# 3. Guardas (hosts parseados, comparación exacta): aborta si BD/Redis/NATS/MQTT/
#    TBMQ/PUBLIC_APP_URL no son localhost, si Redis no es el del overlay (6380),
#    si las BDs no son *_dev o si hay credenciales de email/Telegram.
#    Funciona tanto con `source` (devuelve 1 y NO exporta DOMOTIC_DEV_ENV) como
#    ejecutado (exit 1), con o sin `set -e`.
_dev_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [ ! -f "$_dev_root/.env.dev" ]; then
  echo "ERROR: falta .env.dev  ->  cp .env.dev.example .env.dev (y rellena los secretos)" >&2
  unset _dev_root
  return 1 2>/dev/null || exit 1
fi

unset DOMOTIC_DEV_ENV
if [ -f "$_dev_root/.env" ]; then
  for _k in $(grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' "$_dev_root/.env" | tr -d '='); do
    export "$_k="
  done
fi
set -a
# shellcheck disable=SC1091
. "$_dev_root/.env.dev"
set +a

# Valida en un único proceso node (URL parsing real, sin subcadenas).
_dev_errors="$(node -e '
const e = process.env, errs = [];
const LOCAL = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
function host(name, { optional = false } = {}) {
  const v = e[name];
  if (!v) { if (!optional) errs.push(`${name} vacío`); return null; }
  let u;
  try { u = new URL(v.replace(/^postgresql:/, "postgres:")); }
  catch { errs.push(`${name} no es una URL válida`); return null; }
  if (!LOCAL.has(u.hostname)) errs.push(`${name} apunta a ${u.hostname} (no es localhost)`);
  return u;
}
for (const n of ["DATABASE_URL", "MASTRA_DATABASE_URL"]) {
  const u = host(n, { optional: n === "MASTRA_DATABASE_URL" });
  if (u && !u.pathname.replace(/^\//, "").endsWith("_dev"))
    errs.push(`${n}: la BD debe terminar en _dev (no toques la BD domotic)`);
}
const r = host("REDIS_URL");
if (r && (r.port || "6379") !== "6380") errs.push("REDIS_URL debe usar el Redis del overlay dev (puerto 6380)");
if (e.REDIS_HOST && !LOCAL.has(e.REDIS_HOST)) errs.push("REDIS_HOST no es localhost");
if ((e.REDIS_PORT || "") !== "6380") errs.push("REDIS_PORT debe ser 6380 (BullMQ de rules-engine)");
host("NATS_URL");
host("MQTT_SERVER_BASE");
host("PUBLIC_APP_URL");
host("MQTT_SERVER_API", { optional: true });
if (e.EMAIL_USER) errs.push("EMAIL_USER definido: se enviarían emails reales");
if (e.TELEGRAM_BOT_TOKEN) errs.push("TELEGRAM_BOT_TOKEN definido: robaría el webhook del bot real");
process.stdout.write(errs.join("\n"));
' 2>&1)"

if [ -n "$_dev_errors" ]; then
  printf 'ABORTADO (entorno dev no aislado):\n%s\n' "$_dev_errors" | sed '2,$s/^/  - /' >&2
  unset _k _dev_root _dev_errors DOMOTIC_DEV_ENV
  return 1 2>/dev/null || exit 1
fi

export DOMOTIC_DEV_ENV=1
unset _k _dev_root _dev_errors
