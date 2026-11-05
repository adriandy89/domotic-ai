#!/usr/bin/env node
// PreToolUse guard (proyecto domotic-ai). Bloquea (exit 2) operaciones que en
// este repo destruyen datos o rompen invariantes. El mensaje de stderr vuelve a
// Claude para que corrija el rumbo. Ver CLAUDE.md → "Reglas duras".
import { basename } from 'node:path';

let raw = '';
for await (const chunk of process.stdin) raw += chunk;

let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0); // payload inesperado: no bloquear
}

const tool = input?.tool_name ?? '';
const ti = input?.tool_input ?? {};

function block(reason) {
  process.stderr.write(`BLOQUEADO por .claude/hooks/guard.mjs: ${reason}\n`);
  process.exit(2);
}

if (tool === 'Bash') {
  const cmd = String(ti.command ?? '');
  // Red de seguridad, no frontera de seguridad: atrapa los errores honestos
  // más probables; un comando ofuscado a propósito puede esquivarla.
  const rules = [
    [/prisma\S*\s+migrate\s+(dev|reset)\b/, 'prisma migrate dev/reset propone RESET con TimescaleDB (borra datos). Usa la skill prisma-migration.'],
    [/prisma\S*\s+db\s+push\b/, 'prisma db push altera el esquema sin migración. Usa la skill prisma-migration.'],
    [/\bdocker\b.*\b(volume\s+(rm|prune)|system\s+prune)\b/, 'borrar volúmenes Docker destruye la BD/Redis locales (stack-domotic_*). Hazlo tú a mano si de verdad quieres.'],
    [/\b(compose|dc\.sh)\b[^|;&]*\bdown\b[^|;&]*(\s-v\b|--volumes)/, '`down -v` borra los volúmenes del stack. Usa `make dev-down` (stop).'],
    [/\bgit\b[^|;&]*\bpush\b[^|;&]*(\s--force|\s-[a-zA-Z]*f[a-zA-Z]*\b|\s\+\S|\s--mirror\b|\s--delete\b|\s-d\b|\s:\S)/, 'push forzado/borrado de ramas remotas prohibido; pide confirmación explícita al usuario.'],
    [/\bgit\b[^|;&]*\bpush\b[^|;&]*\s(\S+:)?(main|master)\b/, 'no se hace push directo a main/master; usa una rama y PR.'],
    [/(^|[\s'"=/<>|;&(:])\.env(\.local|\.production[\w.-]*)?(?![\w.-])/, 'no leas ni escribas .env/.env.local desde la shell (secretos, puede apuntar a producción). Usa .env.dev / .env.example; para nombres de claves pide al usuario.'],
    [/\b(pnpm|npm)\s+(run\s+)?start(:dev|:debug|:prod)?\b|\bnest\s+start\b|\bmake\s+(all|api|core|rules|init|ai|integrations|appliance-monitor)\b/, 'arrancar apps con .env puede conectar con PRODUCCIÓN (broker MQTT/TBMQ). Usa scripts/dev/run.sh <app> o make dev-<app>.'],
  ];
  const usesDevRunner = /scripts\/dev\/run\.sh|\bmake\s+dev-/.test(cmd);
  for (const [re, reason] of rules) {
    if (reason.startsWith('arrancar apps') && usesDevRunner) continue;
    if (re.test(cmd)) block(reason);
  }
  if (/redis-cli/.test(cmd) && /\bflush(all|db)\b/i.test(cmd)) {
    block('FLUSHALL/FLUSHDB borra sesiones (sess:) y colas BullMQ (bull:). Usa CacheService.flushAllExcept.');
  }
  if (
    /(stack-client\/edge\/rules-engine\/src\/vendor\/|generated\/prisma)/.test(cmd) &&
    /(\bsed\s+-i|\btee\b|>|\bcp\b|\bmv\b|\brm\b|\btruncate\b|\bperl\s+-[a-z]*i)/.test(cmd)
  ) {
    block('src/vendor/ y generated/prisma son salidas generadas: edita libs/ y ejecuta `pnpm vendor`, o cambia schema.prisma y `prisma generate`.');
  }
  process.exit(0);
}

if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
  const file = String(ti.file_path ?? ti.notebook_path ?? '');
  if (file.includes('/stack-client/edge/rules-engine/src/vendor/')) {
    block('src/vendor/ es una copia generada. Edita libs/rules-evaluator o libs/models/src/device/protocols y ejecuta `pnpm vendor` (skill edge-vendor).');
  }
  if (file.includes('/generated/prisma/')) {
    block('generated/prisma es salida de `prisma generate`; cambia prisma/schema.prisma y regenera.');
  }
  const name = basename(file);
  if (name === '.env' || name === '.env.local' || name.startsWith('.env.production')) {
    block(`${name} contiene secretos/configuración real (puede ser producción). Para local usa .env.dev; para documentar, .env.example / .env.dev.example.`);
  }
}

process.exit(0);
