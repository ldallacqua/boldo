import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// No GitHub Pages o app mora em /<repositório>/; o workflow de deploy define BASE_PATH.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'] },
      manifest: {
        id: base,
        name: 'Boldo: farmacinha de casa',
        short_name: 'Boldo',
        description: 'Os remédios que você tem em casa, quanto resta e quando tomar.',
        lang: 'pt-BR',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#F3ECD9',
        theme_color: '#1C3829',
        categories: ['health', 'medical', 'lifestyle'],
        icons: [
          { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
          {
            src: `${base}icons/icon-maskable-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          { name: 'Adicionar remédio', url: `${base}remedios/novo` },
          { name: 'Remédios', url: `${base}remedios` },
        ],
      },
    }),
  ],
  server: {
    // Em desenvolvimento, a API roda à parte (npm run dev:api) na porta PORT (padrão 3210).
    proxy: { '/api': `http://localhost:${process.env.PORT ?? 3210}` },
  },
});
