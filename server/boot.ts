import { randomBytes } from 'node:crypto';
import { createApp, type AppOptions } from './app';
import { createWebPushSender, ensureVapidKeys } from './push';
import type { TickContext } from './scheduler';
import type { Store } from './store';
import { createTokens } from './tokens';

export interface BootOptions extends Pick<
  AppOptions,
  'allowedOrigins' | 'trustProxy' | 'clientAddress'
> {
  store: Store;
  password: string;
  timezone: string;
  vapidSubject: string;
  /** Liga `POST /api/tick` com um segredo gerado e guardado no banco. */
  externalCron?: boolean;
}

/** O que os dois pontos de entrada (Node e Edge Function) têm em comum ao subir. */
export async function boot(options: BootOptions) {
  const { store, password, timezone } = options;
  await store.init();

  const random = () => randomBytes(32).toString('hex');
  const sessionSecret = await store.getOrCreateSetting('sessionSecret', random);
  const cronSecret = options.externalCron
    ? await store.getOrCreateSetting('cronSecret', random)
    : undefined;
  // Trocar a senha muda as assinaturas e derruba todas as sessões abertas.
  const tokens = createTokens(`${sessionSecret}:${password}`);
  const vapid = await ensureVapidKeys(store);
  const sender = createWebPushSender(store, vapid, options.vapidSubject);

  const app = createApp({
    store,
    sender,
    password,
    tokens,
    timezone,
    vapidPublicKey: vapid.publicKey,
    cronSecret,
    allowedOrigins: options.allowedOrigins,
    trustProxy: options.trustProxy,
    clientAddress: options.clientAddress,
  });
  const tick: TickContext = { store, sender, timezone, tokens };
  return { app, tick };
}
