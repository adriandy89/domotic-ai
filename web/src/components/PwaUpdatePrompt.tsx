import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useRegisterSW } from 'virtual:pwa-register/react';

import { forceUpdate, startVersionWatch } from '../lib/version-check';

// Cada cuánto le pedimos al navegador que compruebe si hay un Service Worker nuevo.
const SW_UPDATE_CHECK_MS = 15 * 60 * 1000;

export function PwaUpdatePrompt() {
  const { t } = useTranslation();
  const messages = {
    title: t('common.version.updateAvailable'),
    description: t('common.version.updatingSoon'),
  };

  useRegisterSW({
    // Con registerType:'autoUpdate' el SW hace skipWaiting + clients.claim solo.
    // Aquí solo empujamos comprobaciones frecuentes para detectar el SW nuevo
    // antes (al volver a la pestaña y cada 15 min), no solo una vez al cargar.
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      const update = () => void registration.update();
      const onVisible = () => {
        if (document.visibilityState === 'visible') update();
      };
      document.addEventListener('visibilitychange', onVisible);
      const interval = window.setInterval(update, SW_UPDATE_CHECK_MS);
      return () => {
        window.clearInterval(interval);
        document.removeEventListener('visibilitychange', onVisible);
      };
    },
    // Si el flujo del SW pide refresco, forzamos la limpieza total igualmente.
    onNeedRefresh() {
      forceUpdate(messages);
    },
  });

  // Red de seguridad independiente del SW: si version.json no coincide con el
  // build cargado, limpia TODO y recarga (aunque el SW se haya quedado pegado).
  // Solo debe arrancar una vez al montar; los mensajes se capturan en el cierre.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => startVersionWatch(messages), []);

  return null;
}
