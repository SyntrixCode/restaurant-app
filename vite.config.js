import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Mevcut public/manifest.json kullanılıyor — plugin'in yenisini üretmesine gerek yok
      manifest: false,
      workbox: {
        // QR menü ve admin için temel offline cache
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // Firestore dinamik istekler cache'lenmesin
        navigateFallbackDenylist: [/^\/__/, /^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com\//,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/.*\.googleapis\.com\//,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false, // dev'de PWA kapalı, sadece build'de aktif
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
  },
});
