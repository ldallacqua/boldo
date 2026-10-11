import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { createWebPushSender, ensureVapidKeys } from './push';
import { startScheduler } from './scheduler';
import { Store } from './store';

const password = process.env.ADMIN_PASSWORD;
if (!password) {
  console.error('Defina ADMIN_PASSWORD (veja .env.example). O Boldo não sobe sem senha.');
  process.exit(1);
}

const port = Number(process.env.PORT ?? 3210);
const dataDir = resolve(process.env.DATA_DIR ?? './data');
const timezone = process.env.TZ ?? 'America/Sao_Paulo';
const staticDir = resolve(process.env.STATIC_DIR ?? './dist');

mkdirSync(dataDir, { recursive: true });
const store = new Store(join(dataDir, 'boldo.db'));

let sessionSecret = store.getSetting('sessionSecret');
if (!sessionSecret) {
  sessionSecret = randomBytes(32).toString('hex');
  store.setSetting('sessionSecret', sessionSecret);
}

const vapid = ensureVapidKeys(store);
const sender = createWebPushSender(
  store,
  vapid,
  process.env.VAPID_SUBJECT ?? 'mailto:boldo@localhost.invalid',
);

const app = createApp({
  store,
  sender,
  password,
  sessionSecret,
  timezone,
  vapidPublicKey: vapid.publicKey,
  staticDir: existsSync(staticDir) ? staticDir : undefined,
  trustProxy: process.env.TRUST_PROXY === '1',
});

// O E2E desliga o agendador para os testes não dependerem do relógio.
const stopScheduler =
  process.env.DISABLE_SCHEDULER === '1' ? () => {} : startScheduler(store, sender, timezone);

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Boldo em http://localhost:${info.port} (fuso ${timezone}, dados em ${dataDir})`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopScheduler();
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
}
