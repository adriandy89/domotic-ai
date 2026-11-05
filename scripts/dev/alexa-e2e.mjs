// E2E de la integración Alexa contra la API local (stack dev aislado).
//
//   make dev-up && make dev-db       # una vez
//   make dev-api  y  make dev-core   # en otras terminales (los comandos
//                                    # viajan API → NATS → mqtt-core → MQTT)
//   make dev-alexa-e2e               # ejecuta el seed --alexa y este script
//
// Opcional: observa lo que llega a los dispositivos con
//   make dev-logs S=mosquitto   (o un suscriptor MQTT a '#' en 127.0.0.1:1883)
//
// Para el caso "cliente de otra organización" crea 'Other Org' + el cliente
// 'dev-alexa-client-org2' en la BD dev (idempotente).
import crypto from 'node:crypto';
import pg from 'pg';

if (process.env.DOMOTIC_DEV_ENV !== '1') {
  console.error('Ejecuta vía `make dev-alexa-e2e` (necesita scripts/dev/env.sh).');
  process.exit(1);
}
for (const v of ['DATABASE_URL']) {
  const host = new URL(process.env[v].replace(/^postgresql:/, 'postgres:')).hostname;
  if (!['localhost', '127.0.0.1'].includes(host)) {
    throw new Error(`Refusing non-local ${v} host ${host}`);
  }
}
const API = `http://localhost:${process.env.API_PORT}/api/v1`;
const { alexaToken: TOKEN, cookie } = JSON.parse(process.argv[2]);
const REDIRECT = 'https://layla.amazon.com/api/skill/link/DEV';

{
  const db = new pg.Client({
    connectionString: process.env.DATABASE_URL.replace(/\?.*$/, ''),
  });
  await db.connect();
  await db.query(
    `INSERT INTO organizations (id, name) VALUES ('00000000-0000-4000-8000-00000000e001', 'Other Org') ON CONFLICT DO NOTHING`,
  );
  await db.query(
    `INSERT INTO alexa_oauth_clients (id, organization_id, client_id, client_secret_hash, name, redirect_uris)
     VALUES ('00000000-0000-4000-8000-00000000e006', '00000000-0000-4000-8000-00000000e001',
             'dev-alexa-client-org2', $1, 'Other org skill', ARRAY[$2])
     ON CONFLICT DO NOTHING`,
    [crypto.createHash('sha256').update('x').digest('hex'), REDIRECT],
  );
  await db.end();
}

const results = [];
const check = (name, cond, extra = '') =>
  results.push([cond ? 'PASS' : 'FAIL', name, extra]);

async function directive(ns, name, { endpointId, payload = {}, token = TOKEN } = {}) {
  const body = {
    directive: {
      header: {
        namespace: ns,
        name,
        payloadVersion: '3',
        messageId: 'm-' + crypto.randomUUID(),
        correlationToken: 'corr-1',
      },
      ...(endpointId && {
        endpoint: { scope: { type: 'BearerToken', token }, endpointId },
      }),
      payload:
        ns === 'Alexa.Discovery' ? { scope: { type: 'BearerToken', token } } : payload,
    },
  };
  const res = await fetch(`${API}/alexa/directives`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

// ── Directivas ───────────────────────────────────────────────────────────────
const disc = await directive('Alexa.Discovery', 'Discover');
const eps = disc.json?.event?.payload?.endpoints ?? [];
check('Discovery devuelve 2 endpoints (luz + cerradura)', eps.length === 2, `got ${eps.length}`);
const light = eps.find((e) => e.friendlyName.includes('Luz'));
const lock = eps.find((e) => e.friendlyName.includes('Cerradura'));
check(
  'Luz expone Power+Brightness+ColorTemperature',
  !!light &&
    ['Alexa.PowerController', 'Alexa.BrightnessController', 'Alexa.ColorTemperatureController'].every(
      (i) => light.capabilities.some((c) => c.interface === i),
    ),
);
check('description <= 128', eps.every((e) => e.description.length <= 128));
if (!light || !lock) {
  console.error('Sin endpoints: ¿has ejecutado make dev-session ARGS=--alexa y la API está arriba?');
  process.exit(1);
}

const bad = await directive('Alexa.Discovery', 'Discover', { token: 'alexaat_invalid' });
check(
  'Discovery con token inválido → 200 + lista vacía',
  bad.status === 200 && bad.json?.event?.payload?.endpoints?.length === 0,
  `status ${bad.status}`,
);

const on = await directive('Alexa.PowerController', 'TurnOn', { endpointId: light.endpointId });
check('TurnOn → Alexa.Response', on.json?.event?.header?.name === 'Response');
check(
  'TurnOn eco powerState=ON',
  on.json?.context?.properties?.find((p) => p.name === 'powerState')?.value === 'ON',
);

const toggle = await directive('Alexa.PowerController', 'Toggle', { endpointId: light.endpointId });
check('Nombre desconocido (Toggle) → INVALID_DIRECTIVE', toggle.json?.event?.payload?.type === 'INVALID_DIRECTIVE');

const bri = await directive('Alexa.BrightnessController', 'SetBrightness', {
  endpointId: light.endpointId,
  payload: { brightness: 50 },
});
check('SetBrightness 50% → Response', bri.json?.event?.header?.name === 'Response');

const lk = await directive('Alexa.LockController', 'Lock', { endpointId: lock.endpointId });
check('Lock → Response', lk.json?.event?.header?.name === 'Response');
const weird = await directive('Alexa.LockController', 'Open', { endpointId: lock.endpointId });
check(
  'Lock con nombre desconocido → INVALID_DIRECTIVE (no desbloquea)',
  weird.json?.event?.payload?.type === 'INVALID_DIRECTIVE',
);

const rs = await directive('Alexa', 'ReportState', { endpointId: light.endpointId });
check('ReportState → StateReport', rs.json?.event?.header?.name === 'StateReport');

const ag = await directive('Alexa.Authorization', 'AcceptGrant', {
  payload: { grant: {}, grantee: { type: 'BearerToken', token: TOKEN } },
});
check(
  'AcceptGrant sin code → Alexa.Authorization ErrorResponse',
  ag.json?.event?.header?.namespace === 'Alexa.Authorization' &&
    ag.json?.event?.payload?.type === 'ACCEPT_GRANT_FAILED',
);

const nope = await directive('Alexa.PowerController', 'TurnOn', {
  endpointId: 'dev:00000000-0000-0000-0000-000000000000',
});
check('Endpoint ajeno → NO_SUCH_ENDPOINT', nope.json?.event?.payload?.type === 'NO_SUCH_ENDPOINT');

// ── OAuth (sesión de navegador) ──────────────────────────────────────────────
const authorize = (qs) =>
  fetch(`${API}/alexa/oauth/authorize?${qs}`, { headers: { cookie }, redirect: 'manual' });

const auth = await authorize(
  `client_id=dev-alexa-client&redirect_uri=${encodeURIComponent(REDIRECT)}&response_type=code&state=xyz`,
);
const html = await auth.text();
check('Consent page 200', auth.status === 200 && html.includes('Link Alexa'), `status ${auth.status}`);
check(
  'Consent page X-Frame-Options DENY + CSP frame-ancestors',
  auth.headers.get('x-frame-options') === 'DENY' &&
    (auth.headers.get('content-security-policy') ?? '').includes("frame-ancestors 'none'"),
);
check('Consent page Cache-Control no-store', (auth.headers.get('cache-control') ?? '').includes('no-store'));

// decision con un nonce válido pero el client_id de OTRA organización → rechazo.
const nonce = /name="nonce" value="([^"]+)"/.exec(html)?.[1];
const decision = await fetch(`${API}/alexa/oauth/authorize/decision`, {
  method: 'POST',
  headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: 'dev-alexa-client-org2',
    redirect_uri: REDIRECT,
    decision: 'allow',
    nonce: nonce ?? '',
  }).toString(),
  redirect: 'manual',
});
check(
  'decision con cliente de otra organización → página de error (sin código)',
  !!nonce &&
    decision.status === 400 &&
    (await decision.text()).includes('different organization'),
  `status ${decision.status}`,
);

// CSRF: un formulario de otra web (Origin ajeno) no llega al handler.
const csrf = await fetch(`${API}/alexa/oauth/authorize/decision`, {
  method: 'POST',
  headers: {
    cookie,
    origin: 'https://evil.example',
    'content-type': 'application/x-www-form-urlencoded',
  },
  body: 'client_id=dev-alexa-client&decision=allow&nonce=x&redirect_uri=x',
  redirect: 'manual',
});
check('POST cross-site (Origin ajeno) → 403', csrf.status === 403, `status ${csrf.status}`);

const dup = await authorize('client_id=a&client_id=b&redirect_uri=x&response_type=code');
check('client_id repetido → 400 (no 500)', dup.status === 400, `status ${dup.status}`);

const org2 = await authorize(
  `client_id=dev-alexa-client-org2&redirect_uri=${encodeURIComponent(REDIRECT)}&response_type=code`,
);
check(
  'Cliente de otra organización → página de error',
  org2.status === 400 && (await org2.text()).includes('different organization'),
  `status ${org2.status}`,
);

const basic = await fetch(`${API}/alexa/oauth/token`, {
  method: 'POST',
  headers: {
    authorization: 'Basic ' + Buffer.from('%ZZ:%ZZ').toString('base64'),
    'content-type': 'application/x-www-form-urlencoded',
  },
  body: 'grant_type=refresh_token&refresh_token=x',
});
check('Basic con %-encoding roto → 401 invalid_client (no 500)', basic.status === 401, `status ${basic.status}`);

// ── CORS (con CORS_ORIGINS de .env.dev) ──────────────────────────────────────
const evil = await fetch(`${API}/auth/me`, { headers: { origin: 'https://evil.example', cookie } });
check(
  'CORS no refleja un origen ajeno',
  evil.headers.get('access-control-allow-origin') !== 'https://evil.example',
);
const good = await fetch(`${API}/auth/me`, { headers: { origin: 'http://localhost:5173', cookie } });
check('CORS permite el front local', good.headers.get('access-control-allow-origin') === 'http://localhost:5173');

for (const [r, n, e] of results) console.log(`${r}  ${n}${r === 'FAIL' && e ? '  ← ' + e : ''}`);
const passed = results.filter((r) => r[0] === 'PASS').length;
console.log(`\n${passed}/${results.length} PASS`);
process.exit(passed === results.length ? 0 : 1);
