import { createApp } from '../../server/app';
import type { PushSender } from '../../server/push';
import { Store } from '../../server/store';
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

/** Banco em memória: cada teste começa do zero. */
export function memoryStore(): Store {
  return new Store(':memory:');
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

/** App completo com relógio controlável e um cliente que guarda o cookie de sessão. */
export function testApp(startAt = '2026-10-12T11:00:00Z') {
  const store = memoryStore();
  const sender = fakeSender();
  const clock = { now: new Date(startAt) };
  const app = createApp({
    store,
    sender,
    password: PASSWORD,
    sessionSecret: 'segredo-de-teste',
    timezone: 'America/Sao_Paulo',
    vapidPublicKey: 'chave-publica',
    now: () => clock.now,
  });

  let cookie = '';
  const call = async (method: string, path: string, body?: unknown) => {
    const response = await app.request(path, {
      method,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: response.status, body: (await response.json()) as any, response };
  };

  return {
    store,
    sender,
    clock,
    call,
    login: () => call('POST', '/api/login', { password: PASSWORD }),
    forgetSession: () => {
      cookie = '';
    },
  };
}
