import { createApp } from '../../server/app';
import { openPglite } from '../../server/db-pglite';
import type { PushSender } from '../../server/push';
import { Store } from '../../server/store';
import { createTokens } from '../../server/tokens';
import type { MedicineInput, PushPayload } from '../../shared/types';

export const everyDay = [0, 1, 2, 3, 4, 5, 6] as MedicineInput['schedules'][number]['days'];

export function input(patch: Partial<MedicineInput> = {}): MedicineInput {
  return {
    name: 'Dipirona',
    dosage: '500 mg',
    purpose: 'Dor e febre',
    unit: 'comprimido',
    quantity: 20,
    lowThreshold: 5,
    expiresOn: '2027-03',
    notes: '',
    schedules: [],
    ...patch,
  };
}

let shared: Promise<Store> | undefined;

/**
 * Um Postgres embutido (PGlite) por arquivo de teste, esvaziado a cada chamada: subir um
 * banco novo por teste custaria quase um segundo cada.
 */
export async function memoryStore(): Promise<Store> {
  shared ??= (async () => {
    const store = new Store(await openPglite());
    await store.init();
    return store;
  })();
  const store = await shared;
  await store.reset();
  return store;
}

export function fakeSender(): PushSender & { sent: PushPayload[] } {
  const sent: PushPayload[] = [];
  return {
    sent,
    async send(payload) {
      sent.push(payload);
      return 1;
    },
  };
}

export const PASSWORD = 'senha-de-teste';
export const CRON_SECRET = 'segredo-do-cron';
export const testTokens = (password = PASSWORD) => createTokens(`segredo-de-teste:${password}`);

/** App completo com relógio controlável e um cliente que guarda o token de sessão. */
export async function testApp(startAt = '2026-10-12T11:00:00Z') {
  const store = await memoryStore();
  const sender = fakeSender();
  const tokens = testTokens();
  const clock = { now: new Date(startAt) };
  const app = createApp({
    store,
    sender,
    password: PASSWORD,
    tokens,
    timezone: 'America/Sao_Paulo',
    vapidPublicKey: 'chave-publica',
    cronSecret: CRON_SECRET,
    allowedOrigins: ['https://app.example'],
    now: () => clock.now,
  });

  let token = '';
  const call = async (
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) => {
    const response = await app.request(path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await response.json().catch(() => null)) as any;
    return { status: response.status, body: data, response };
  };

  return {
    app,
    store,
    sender,
    tokens,
    clock,
    call,
    async login() {
      const result = await call('POST', '/api/login', { password: PASSWORD });
      if (result.body?.token) token = result.body.token;
      return result;
    },
    useToken(value: string) {
      token = value;
    },
  };
}
