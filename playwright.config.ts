import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

/**
 * Os testes rodam contra o app de produção (build + servidor) com um banco novo a cada execução.
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
    // O cache do service worker atrapalharia os testes de tela; o teste de PWA liga de volta.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'celular', use: { ...devices['Pixel 7'] } },
    { name: 'tablet', use: { ...devices['Galaxy Tab S9'] } },
  ],
  webServer: {
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
    },
  },
});
