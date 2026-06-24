import { toast } from 'sonner';

import { hardReset } from './hard-reset';
import { RUNTIME_VERSION } from './version';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const FALLBACK_RELOAD_MS = 60 * 1000;

// Textos ya traducidos (i18n vive en la capa de React; este módulo se mantiene
// agnóstico para no importar react-i18next).
export interface UpdateMessages {
  title: string;
  description: string;
}

async function fetchServerVersion(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?_=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

let engaged = false;

/**
 * Fuerza la limpieza total, pero sin pisar lo que el usuario esté haciendo: si la
 * pestaña no está a la vista recarga ya; si está visible, avisa y recarga cuando
 * el usuario vuelve a la pestaña (o por tope de tiempo).
 */
export function forceUpdate(messages: UpdateMessages): void {
  if (engaged) return;
  engaged = true;

  if (document.visibilityState === 'hidden') {
    void hardReset();
    return;
  }

  toast(messages.title, {
    description: messages.description,
    duration: Infinity,
  });

  const run = () => {
    document.removeEventListener('visibilitychange', onVisible);
    void hardReset();
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') run();
  };
  document.addEventListener('visibilitychange', onVisible);
  window.setTimeout(run, FALLBACK_RELOAD_MS);
}

/**
 * Red de seguridad independiente del Service Worker: compara la versión del
 * servidor (version.json) con la del build cargado. Si difieren, fuerza la
 * actualización aunque el SW se haya quedado pegado (p.ej. sw.js cacheado en CDN).
 */
export function startVersionWatch(messages: UpdateMessages): () => void {
  const check = async () => {
    const server = await fetchServerVersion();
    if (server && server !== RUNTIME_VERSION) forceUpdate(messages);
  };

  void check();
  const onVisible = () => {
    if (document.visibilityState === 'visible') void check();
  };
  document.addEventListener('visibilitychange', onVisible);
  const interval = window.setInterval(() => void check(), CHECK_INTERVAL_MS);

  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    window.clearInterval(interval);
  };
}
