// Seed de desarrollo + sesión de login sin OAuth (SOLO stack local).
//
//   make dev-session            # crea/reusa org+usuario ADMIN+casa+2 dispositivos
//                               # y escribe una sesión en Redis → imprime la cookie
//   make dev-session ARGS=--alexa   # además crea un cliente Alexa + access token
//
// Salida (JSON en la última línea) para scripts/agentes:
//   {"cookie":"domotic.sh=s%3A...","homeUniqueId":"...","lightId":"...","alexaToken":"alexaat_..."}
//
// Idempotente: IDs fijos + ON CONFLICT DO NOTHING. Se niega a correr si el
// entorno no es el aislado (scripts/dev/env.sh) o la BD/Redis no son locales.
import crypto from 'node:crypto';
import pg from 'pg';
import { createClient } from 'redis';

if (process.env.DOMOTIC_DEV_ENV !== '1') {
  console.error('Ejecuta vía `make dev-session` (necesita scripts/dev/env.sh).');
  process.exit(1);
}
for (const v of ['DATABASE_URL', 'REDIS_URL']) {
  const host = new URL(process.env[v].replace(/^postgresql:/, 'postgres:')).hostname;
  if (!['localhost', '127.0.0.1'].includes(host)) {
    throw new Error(`Refusing non-local ${v} host ${host}`);
  }
}

const withAlexa = process.argv.includes('--alexa');
const ID = {
  org: '00000000-0000-4000-8000-00000000d001',
  user: '00000000-0000-4000-8000-00000000d002',
  home: '00000000-0000-4000-8000-00000000d003',
  homeUnique: 'devhome0-0000-4000-8000-000000000001',
  light: '00000000-0000-4000-8000-00000000d004',
  lock: '00000000-0000-4000-8000-00000000d005',
  alexaClient: '00000000-0000-4000-8000-00000000d006',
};
const EMAIL = 'dev@domotic.local';

const LIGHT_EXPOSES = [
  {
    type: 'light',
    features: [
      { type: 'binary', name: 'state', property: 'state', access: 7, value_on: 'ON', value_off: 'OFF', value_toggle: 'TOGGLE' },
      { type: 'numeric', name: 'brightness', property: 'brightness', access: 7, value_min: 0, value_max: 254 },
      { type: 'numeric', name: 'color_temp', property: 'color_temp', access: 7, value_min: 150, value_max: 500, unit: 'mired' },
    ],
  },
  { type: 'numeric', name: 'linkquality', property: 'linkquality', access: 1, unit: 'lqi' },
];
const LOCK_EXPOSES = [
  {
    type: 'lock',
    features: [
      { type: 'binary', name: 'state', property: 'state', access: 7, value_on: 'LOCK', value_off: 'UNLOCK' },
    ],
  },
];

const db = new pg.Client({
  connectionString: process.env.DATABASE_URL.replace(/\?.*$/, ''),
});
await db.connect();
try {
  await db.query(
    `INSERT INTO organizations (id, name) VALUES ($1, 'Dev Org') ON CONFLICT (id) DO NOTHING`,
    [ID.org],
  );
  await db.query(
    `INSERT INTO users (id, email, name, organization_id, role, is_org_admin, is_active)
     VALUES ($1, $2, 'Dev Admin', $3, 'ADMIN', true, true) ON CONFLICT (id) DO NOTHING`,
    [ID.user, EMAIL, ID.org],
  );
  await db.query(
    `INSERT INTO homes (id, unique_id, name, organization_id, timezone)
     VALUES ($1, $2, 'Dev Home', $3, 'Europe/Madrid') ON CONFLICT (id) DO NOTHING`,
    [ID.home, ID.homeUnique, ID.org],
  );
  await db.query(
    `INSERT INTO users_homes (user_id, home_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [ID.user, ID.home],
  );
  for (const [id, uid, name, exposes] of [
    [ID.light, '0xdev0000000000001', 'Luz salon', LIGHT_EXPOSES],
    [ID.lock, '0xdev0000000000002', 'Cerradura entrada', LOCK_EXPOSES],
  ]) {
    await db.query(
      `INSERT INTO devices (id, unique_id, name, model, protocol, attributes, organization_id, home_id, online)
       VALUES ($1, $2, $3, 'DEV-MODEL', 'zigbee', $4, $5, $6, true) ON CONFLICT (id) DO NOTHING`,
      [id, uid, name, JSON.stringify({ definition: { exposes } }), ID.org, ID.home],
    );
  }

  const out = { homeUniqueId: ID.homeUnique, lightId: ID.light, lockId: ID.lock };

  if (withAlexa) {
    const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
    await db.query(
      `INSERT INTO alexa_oauth_clients (id, organization_id, client_id, client_secret_hash, name, redirect_uris)
       VALUES ($1, $2, 'dev-alexa-client', $3, 'Dev Alexa', ARRAY['https://layla.amazon.com/api/skill/link/DEV'])
       ON CONFLICT (id) DO NOTHING`,
      [ID.alexaClient, ID.org, sha('dev-alexa-secret')],
    );
    const token = 'alexaat_dev_' + crypto.randomBytes(24).toString('base64url');
    await db.query(
      `INSERT INTO alexa_access_tokens (token_hash, client_id, user_id, expires_at)
       VALUES ($1, 'dev-alexa-client', $2, now() + interval '1 hour')`,
      [sha(token), ID.user],
    );
    out.alexaToken = token;
  }

  // Sesión express-session + connect-redis (prefix 'sess:', cookie 'domotic.sh').
  const user = (
    await db.query(
      `SELECT id, email, name, is_org_admin, organization_id, is_active, role, phone,
              attributes, telegram_chat_id, channels, notification_batch_minutes
       FROM users WHERE id = $1`,
      [ID.user],
    )
  ).rows[0];
  const sid = crypto.randomBytes(24).toString('base64url');
  const maxAge = 1000 * 60 * 60 * 24 * 3;
  const redis = createClient({
    url: process.env.REDIS_URL,
    password: process.env.REDIS_PASSWORD || undefined,
  });
  await redis.connect();
  await redis.set(
    `sess:${sid}`,
    JSON.stringify({
      cookie: {
        originalMaxAge: maxAge,
        expires: new Date(Date.now() + maxAge).toISOString(),
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
      },
      passport: { user },
    }),
    { EX: Math.floor(maxAge / 1000) },
  );
  await redis.quit();
  // cookie-signature: base64(HMAC-SHA256(secret, sid)) sin '=' final.
  const sig = crypto
    .createHmac('sha256', process.env.SESSION_SECRET)
    .update(sid)
    .digest('base64')
    .replace(/=+$/, '');
  out.cookie = `domotic.sh=${encodeURIComponent(`s:${sid}.${sig}`)}`;

  console.error(`Usuario ${EMAIL} (ADMIN) · casa ${ID.homeUnique} · luz ${ID.light}`);
  console.error(`curl -H 'Cookie: ${out.cookie}' http://localhost:${process.env.API_PORT}/api/v1/auth/me`);
  console.log(JSON.stringify(out));
} finally {
  await db.end();
}
