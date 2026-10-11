import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const PAGES_PORT = 4174;
const PAGES_SPEC = /pages\.spec\.ts/;

/**
 * Os testes rodam contra o app de produção, com um banco novo a cada execução, em duas formas:
 * - "um servidor só" (desktop, celular, tablet): o Node entrega app e API na mesma origem;
 * - "pages": o app em uma subpasta de um site estático e a API em outra origem, como na
 *   hospedagem gratuita (GitHub Pages + Supabase).
 * A senha usada pelos testes está em tests/e2e/helpers.ts.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  // Um servidor e um banco só: os testes rodam em fila para não disputar dados.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    // O cache do service worker atrapalharia os testes de tela; os testes de PWA ligam de volta.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', testIgnore: PAGES_SPEC, use: { ...devices['Desktop Chrome'] } },
    { name: 'celular', testIgnore: PAGES_SPEC, use: { ...devices['Pixel 7'] } },
    { name: 'tablet', testIgnore: PAGES_SPEC, use: { ...devices['Galaxy Tab S9'] } },
    {
      name: 'pages',
      testMatch: PAGES_SPEC,
      use: { ...devices['Pixel 7'], baseURL: `http://localhost:${PAGES_PORT}/boldo/` },
    },
  ],
  webServer: [
    {
      command: 'rm -rf .e2e-data && npm run build && node dist-server/index.js',
      url: `http://localhost:${PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: String(PORT),
        ADMIN_PASSWORD: 'senha-e2e',
        DATA_DIR: '.e2e-data',
        DISABLE_SCHEDULER: '1',
        TZ: 'America/Sao_Paulo',
        ALLOWED_ORIGINS: `http://localhost:${PAGES_PORT}`,
      },
    },
    {
      command: `npx vite build --outDir dist-pages --emptyOutDir && cp dist-pages/index.html dist-pages/404.html && node scripts/serve-pages.mjs dist-pages /boldo/ ${PAGES_PORT}`,
      url: `http://localhost:${PAGES_PORT}/boldo/`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { BASE_PATH: '/boldo/', VITE_API_BASE: `http://localhost:${PORT}` },
    },
  ],
});
