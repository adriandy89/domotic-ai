// Genera .env.docker.dev (gitignored) a partir de .env.dev para ejecutar las
// IMÁGENES del backend en Docker contra el stack local (red domotic-network):
// localhost:5433 → timescaledb:5432, localhost:6380 → redis:6379, etc.
// Valida que todo apunte a contenedores locales y que no haya email/Telegram.
//   node scripts/dev/docker-env.mjs   (lo llama `make docker-env`)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = readFileSync(join(root, '.env.dev'), 'utf8');

const env = {};
for (const line of src.split('\n')) {
  const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
  if (!m) continue;
  env[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
}

const LOCAL_CONTAINERS = {
  postgres: { host: 'timescaledb', port: '5432' },
  redis: { host: 'redis', port: '6379' },
  nats: { host: 'nats', port: '4222' },
  mqtt: { host: 'domotic-mosquitto', port: '' },
};
function retarget(key, target) {
  if (!env[key]) return;
  const u = new URL(env[key].replace(/^postgresql:/, 'postgres:'));
  u.hostname = target.host;
  u.port = target.port;
  env[key] = u.toString().replace(/^postgres:/, 'postgresql:').replace(/\/$/, '');
}
retarget('DATABASE_URL', LOCAL_CONTAINERS.postgres);
retarget('MASTRA_DATABASE_URL', LOCAL_CONTAINERS.postgres);
retarget('REDIS_URL', LOCAL_CONTAINERS.redis);
retarget('NATS_URL', LOCAL_CONTAINERS.nats);
retarget('MQTT_SERVER_BASE', LOCAL_CONTAINERS.mqtt);
env.REDIS_HOST = 'redis';
env.REDIS_PORT = '6379';
env.MQTT_PORT = '1883';

// ── Guardas ────────────────────────────────────────────────────────────────
const allowed = new Set([
  ...Object.values(LOCAL_CONTAINERS).map((c) => c.host),
  'localhost',
  '127.0.0.1',
]);
const errs = [];
for (const key of [
  'DATABASE_URL',
  'MASTRA_DATABASE_URL',
  'REDIS_URL',
  'NATS_URL',
  'MQTT_SERVER_BASE',
  'MQTT_SERVER_API',
  'PUBLIC_APP_URL',
]) {
  if (!env[key]) continue;
  const host = new URL(env[key].replace(/^postgresql:/, 'postgres:')).hostname;
  if (!allowed.has(host)) errs.push(`${key} apunta a ${host}`);
}
for (const key of ['DATABASE_URL', 'MASTRA_DATABASE_URL']) {
  if (env[key] && !new URL(env[key].replace(/^postgresql:/, 'postgres:')).pathname.endsWith('_dev')) {
    errs.push(`${key}: la BD debe terminar en _dev`);
  }
}
if (env.EMAIL_USER) errs.push('EMAIL_USER definido');
if (env.TELEGRAM_BOT_TOKEN) errs.push('TELEGRAM_BOT_TOKEN definido');
if (errs.length) {
  console.error('ABORTADO (.env.docker.dev no aislado):\n  - ' + errs.join('\n  - '));
  process.exit(1);
}

const out =
  '# GENERADO por scripts/dev/docker-env.mjs desde .env.dev — no editar.\n' +
  Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n') +
  '\n';
writeFileSync(join(root, '.env.docker.dev'), out, { mode: 0o600 });
console.log(`.env.docker.dev generado (${Object.keys(env).length} variables, hosts locales ✓)`);
