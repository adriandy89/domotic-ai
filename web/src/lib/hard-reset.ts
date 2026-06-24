/**
 * Limpieza TOTAL del frontend: desregistra todos los Service Workers, borra todo
 * el Cache Storage y recarga sin caché. Garantiza que no quede nada del bundle
 * antiguo tras un despliegue.
 */
export async function hardReset(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // Si algo falla, recargamos igual: lo importante es no quedarse pegado.
  } finally {
    // location.reload(true) ya no fuerza recarga dura en Chrome; usamos
    // cache-busting por query param.
    const url = new URL(window.location.href);
    url.searchParams.set('_v', Date.now().toString());
    window.location.replace(url.toString());
  }
}
