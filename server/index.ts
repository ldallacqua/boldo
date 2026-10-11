import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { boot } from './boot';
import { startScheduler } from './scheduler';
import { mountStatic } from './static';
import { Store } from './store';

/**
 * Entrada "um servidor só" (Node): API + app + agendador no mesmo processo.
 * A hospedagem gratuita usa outra entrada: supabase/functions/api/main.ts.
 */

const password = process.env.ADMIN_PASSWORD;
if (!password) {
  console.error('Defina ADMIN_PASSWORD (veja .env.example). O Boldo não sobe sem senha.');
  process.exit(1);
}

const port = Number(process.env.PORT ?? 3210);
const dataDir = resolve(process.env.DATA_DIR ?? './data');
const timezone = process.env.TZ ?? 'America/Sao_Paulo';
const staticDir = resolve(process.env.STATIC_DIR ?? './dist');
const databaseUrl = process.env.DATABASE_URL;

// Com DATABASE_URL, usa um Postgres externo; sem ela, o Postgres embutido em DATA_DIR.
let where: string;
let store: Store;
if (databaseUrl) {
  const { openPostgres } = await import('./db-postgres');
  store = new Store(openPostgres(databaseUrl));
  where = 'Postgres externo';
} else {
  const { openPglite } = await import('./db-pglite');
  mkdirSync(dataDir, { recursive: true });
  store = new Store(await openPglite(join(dataDir, 'pg')));
  where = `dados em ${dataDir}`;
}

const { app, tick } = await boot({
  store,
  password,
  timezone,
  vapidSubject: process.env.VAPID_SUBJECT ?? 'https://github.com/ldallacqua/boldo',
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',').map((origin) => origin.trim()),
  trustProxy: process.env.TRUST_PROXY === '1',
  clientAddress: (c) => {
    try {
      return getConnInfo(c).remote.address;
    } catch {
      return undefined;
    }
  },
});
if (existsSync(staticDir)) mountStatic(app, staticDir);

// O E2E desliga o agendador para os testes não dependerem do relógio.
const stopScheduler = process.env.DISABLE_SCHEDULER === '1' ? () => {} : startScheduler(tick);

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Boldo em http://localhost:${info.port} (fuso ${timezone}, ${where})`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopScheduler();
    server.close(() => {
      void store.close().finally(() => process.exit(0));
    });
  });
}
