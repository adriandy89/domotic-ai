#!/usr/bin/env node
// Antigüedad de las dependencias DIRECTAS (versión resuelta en el lockfile).
// Una versión publicada hace horas/días es el riesgo típico de cadena de
// suministro (paquetes secuestrados): no la instales hasta que tenga N días.
//
//   node scripts/dev/release-age.mjs            # 7 días, los 4 proyectos pnpm
//   node scripts/dev/release-age.mjs 3 web      # umbral y proyectos a mano
//
// Lista las que no llegan al umbral y propone la versión más nueva de la MISMA
// major que sí llega (fíjala con `pnpm add <pkg>@<versión>`). Sale con código 1
// si hay alguna.
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';

const pexec = promisify(execFile);
const DEFAULT_DIRS = ['.', 'web', 'stack-client/edge/rules-engine', 'stack-client/lan-bridge'];

const [daysArg = '7', ...dirArgs] = process.argv.slice(2);
const days = Number(daysArg);
if (!Number.isFinite(days) || days < 0) {
  console.error(`Umbral de días inválido: ${daysArg}`);
  process.exit(2);
}
const dirs = dirArgs.length ? dirArgs : DEFAULT_DIRS;
const now = Date.now();
const limitMs = days * 86_400_000;

const deps = [];
for (const dir of dirs) {
  const out = execFileSync('pnpm', ['-C', dir, 'ls', '--json', '--depth', '0'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const [root] = JSON.parse(out);
  for (const kind of ['dependencies', 'devDependencies']) {
    for (const [name, info] of Object.entries(root[kind] ?? {})) {
      if (!info.version || info.version.startsWith('link:')) continue;
      deps.push({ dir, name, version: info.version });
    }
  }
}

const timesByName = new Map();
const times = (name) => {
  if (!timesByName.has(name)) {
    timesByName.set(
      name,
      pexec('npm', ['view', name, 'time', '--json'], { maxBuffer: 64 * 1024 * 1024 })
        .then((r) => JSON.parse(r.stdout))
        .catch(() => null),
    );
  }
  return timesByName.get(name);
};

const fresh = [];
const unknown = [];
const queue = [...deps];
await Promise.all(
  Array.from({ length: 12 }, async () => {
    for (let d = queue.shift(); d; d = queue.shift()) {
      const t = await times(d.name);
      const published = t?.[d.version] ? Date.parse(t[d.version]) : NaN;
      if (Number.isNaN(published)) {
        unknown.push(d);
        continue;
      }
      if (now - published >= limitMs) continue;
      const major = d.version.split('.')[0];
      const [alt] = Object.entries(t)
        .filter(([v, iso]) => /^\d+\.\d+\.\d+$/.test(v) && v.split('.')[0] === major && now - Date.parse(iso) >= limitMs)
        .sort((a, b) => Date.parse(b[1]) - Date.parse(a[1]));
      fresh.push({
        ...d,
        ageDays: ((now - published) / 86_400_000).toFixed(1),
        alt: alt ? `${alt[0]} (${alt[1].slice(0, 10)})` : '— (ninguna en esta major)',
      });
    }
  }),
);

console.log(`${deps.length} dependencias directas; umbral ${days} días.`);
for (const d of fresh.sort((a, b) => a.dir.localeCompare(b.dir) || a.name.localeCompare(b.name))) {
  console.log(`  ${d.dir.padEnd(30)} ${d.name}@${d.version}  ${d.ageDays} d  → ${d.alt}`);
}
for (const d of unknown) console.log(`  ${d.dir.padEnd(30)} ${d.name}@${d.version}  (sin fecha en npm)`);
console.log(fresh.length ? `${fresh.length} demasiado recientes.` : 'Ninguna por debajo del umbral.');
process.exit(fresh.length ? 1 : 0);
