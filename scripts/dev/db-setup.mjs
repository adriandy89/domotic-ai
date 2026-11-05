// Crea (si faltan) las BDs de desarrollo de .env.dev en el Postgres local y
// muestra qué extensiones hay. NO toca otras BDs (p.ej. tu `domotic`).
// Uso: make dev-db   (carga .env.dev, ejecuta esto y `prisma migrate deploy`)
import pg from 'pg';

if (process.env.DOMOTIC_DEV_ENV !== '1') {
  console.error('Ejecuta vía `make dev-db` (necesita scripts/dev/env.sh).');
  process.exit(1);
}

const targets = [process.env.DATABASE_URL, process.env.MASTRA_DATABASE_URL]
  .filter(Boolean)
  .map((u) => new URL(u.replace(/^postgresql:/, 'postgres:')));

for (const url of targets) {
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error(`Refusing non-local database host ${url.hostname}`);
  }
}

const dbName = (url) => decodeURIComponent(url.pathname.slice(1));
const admin = new URL(targets[0]);
admin.pathname = '/postgres';
admin.search = '';

const client = new pg.Client({ connectionString: admin.toString() });
await client.connect();
try {
  const { rows } = await client.query(
    'SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY 1',
  );
  const existing = new Set(rows.map((r) => r.datname));
  console.log('BDs existentes:', [...existing].join(', '));
  for (const url of targets) {
    const name = dbName(url);
    if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`Nombre de BD raro: ${name}`);
    if (existing.has(name)) {
      console.log(`✔ ${name} ya existe`);
    } else {
      await client.query(`CREATE DATABASE "${name}"`);
      console.log(`✚ creada ${name}`);
    }
  }
  const ext = await client.query(
    "SELECT name, default_version FROM pg_available_extensions WHERE name IN ('timescaledb','vector') ORDER BY 1",
  );
  console.log(
    'Extensiones disponibles:',
    ext.rows.map((r) => `${r.name}@${r.default_version}`).join(', ') || '(ninguna)',
  );
} finally {
  await client.end();
}

// timescaledb debe existir en la BD de la app antes de migrar (las migraciones
// crean hypertables pero no ejecutan CREATE EXTENSION).
for (const url of targets) {
  const c = new pg.Client({ connectionString: url.toString().replace(/\?.*$/, '') });
  await c.connect();
  try {
    const want = url === targets[0] ? 'timescaledb' : 'vector';
    try {
      await c.query(`CREATE EXTENSION IF NOT EXISTS ${want}`);
      console.log(`✔ extensión ${want} en ${dbName(url)}`);
    } catch (e) {
      console.warn(`⚠ no se pudo crear ${want} en ${dbName(url)}: ${e.message}`);
    }
  } finally {
    await c.end();
  }
}
