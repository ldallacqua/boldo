import { createECDH, randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createWebPushSender, ensureVapidKeys } from '../../server/push';
import { memoryStore } from './helpers';

const payload = { title: 'Teste', body: 'Corpo', tag: 'test', url: '/' };

/** Uma inscrição com chaves reais (para a criptografia funcionar) apontando para lugar nenhum. */
function deadSubscription() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    endpoint: 'https://127.0.0.1:1/push/abc',
    p256dh: ecdh.getPublicKey().toString('base64url'),
    auth: randomBytes(16).toString('base64url'),
  };
}

describe('chaves VAPID', () => {
  it('são geradas uma vez e reaproveitadas', () => {
    const store = memoryStore();
    const first = ensureVapidKeys(store);
    expect(first.publicKey).toMatch(/^[\w-]{80,}$/);
    expect(first.privateKey).toMatch(/^[\w-]{40,}$/);
    expect(ensureVapidKeys(store)).toEqual(first);
  });
});

describe('envio de push', () => {
  it('sem aparelhos inscritos, não envia nada', async () => {
    const store = memoryStore();
    const sender = createWebPushSender(store, ensureVapidKeys(store), 'mailto:teste@example.com');
    expect(await sender.send(payload)).toBe(0);
  });

  it('falha de rede não derruba o servidor nem apaga a inscrição', async () => {
    const store = memoryStore();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    store.saveSubscription(deadSubscription(), 'agora');
    const sender = createWebPushSender(store, ensureVapidKeys(store), 'mailto:teste@example.com');

    expect(await sender.send(payload)).toBe(0);
    expect(store.countSubscriptions()).toBe(1);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
