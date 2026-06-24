import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Identificador único por build: APP_VERSION (CI) > hash de git > timestamp.
// Se incrusta en el bundle (__APP_VERSION__) y se emite a /version.json; el
// frontend compara ambos en runtime para detectar versiones nuevas.
const buildId =
  process.env.APP_VERSION?.trim() ||
  (() => {
    try {
      return execSync('git rev-parse --short HEAD').toString().trim();
    } catch {
      return '';
    }
  })() ||
  `t${Date.now()}`;

// Emite dist/version.json con el mismo buildId que se incrusta en el bundle.
function emitVersionJson(version: string): Plugin {
  return {
    name: 'emit-version-json',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version }),
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    emitVersionJson(buildId),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.ico', 'logo.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Domotic AI',
        short_name: 'Domotic AI',
        description: 'Gestión y automatización del hogar inteligente con IA',
        theme_color: '#0b1220',
        background_color: '#0b1220',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(buildId),
  },
  build: {
    chunkSizeWarningLimit: 1024, // 1MB
  },
  server: {
    proxy: {
      '/api': {
        // target: 'https://app.domotic-ai.com',
        target: 'http://localhost:3003',
        // secure: true,
      },
    },
  },
});
