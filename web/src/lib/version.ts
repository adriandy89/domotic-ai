// Versión del build cargado actualmente. Se incrusta en tiempo de compilación
// vía `define: { __APP_VERSION__ }` en vite.config.ts. En `npm run dev` no está
// definida, por eso el fallback a 'dev'. El watcher compara este valor contra el
// que sirve /version.json para detectar despliegues nuevos.
export const RUNTIME_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
