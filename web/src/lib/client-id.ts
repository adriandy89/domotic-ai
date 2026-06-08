// Genera un Client ID único y legible para conexiones MQTT.
//
// Un Client ID debe ser ÚNICO por cada cliente/conexión al broker: si dos
// clientes se conectan con el mismo ID, el broker desconecta a uno. Por eso no
// es un valor fijo de la casa, sino algo que se genera bajo demanda — uno nuevo
// para cada dispositivo o conexión.
//
// Formato: `{slug-de-la-casa}-{10 hex aleatorios}` (p.ej. `casa2-7f3a9c2b1e`).
// Solo usa [a-z0-9-], es corto y legible/rastreable, y único en cada generación.
export function generateClientId(name?: string, fallback?: string): string {
  const base =
    (name || fallback || 'home')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // quita acentos: "Casá" -> "casa"
      .replace(/[^a-z0-9]+/g, '') // -> "casa2"
      .slice(0, 16) || 'home';
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  const rand = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''); // 10 hex
  return `${base}-${rand}`;
}
