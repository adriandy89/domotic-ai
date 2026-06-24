import { defineConfig } from '@vite-pwa/assets-generator/config';

// Genera los iconos PWA/favicon a partir de public/logo.svg.
// El logo ya es a sangre completa con fondo oscuro, por eso maskable usa
// padding 0 (el contenido vive dentro de la zona segura del propio SVG).
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    transparent: {
      sizes: [64, 192, 512],
      favicons: [[48, 'favicon.ico']],
      padding: 0,
    },
    maskable: {
      sizes: [512],
      padding: 0,
      resizeOptions: { background: '#0b1220' },
    },
    apple: {
      sizes: [180],
      padding: 0.05,
      resizeOptions: { background: '#0b1220' },
    },
  },
  images: ['public/logo.svg'],
});
