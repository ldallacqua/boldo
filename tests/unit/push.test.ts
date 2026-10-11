import { createDecipheriv, createECDH, hkdfSync, randomBytes, type ECDH } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import webpush from 'web-push';
import {
  createWebPushSender,
  encryptPayload,
  ensureVapidKeys,
  fromBase64Url,
  generateVapidKeys,
  toBase64Url,
  vapidAuthorization,
} from '../../server/push';
import { memoryStore } from './helpers';

const payload = { title: 'Teste', body: 'Corpo', tag: 'test', url: '/' };
const SUBJECT = 'https://boldo.example/';

/** Um "navegador" de mentira: o par de chaves e o segredo que uma inscrição real teria. */
function fakeBrowser() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = randomBytes(16);
  return {
    ecdh,
    auth,
    subscription: {
      endpoint: 'https://push.example/send/abc',
      p256dh: ecdh.getPublicKey().toString('base64url'),
      auth: auth.toString('base64url'),
    },
  };
}

/**
 * O que o navegador faz ao receber: decifra a mensagem conforme a RFC 8291. Escrito com
 * node:crypto, de propósito diferente da implementação (Web Crypto) que está em teste.
 */
function decrypt(body: Uint8Array, receiver: ECDH, auth: Buffer): string {
  const message = Buffer.from(body);
  const salt = message.subarray(0, 16);
  const keyLength = message[20];
  const senderPublic = message.subarray(21, 21 + keyLength);
  const ciphertext = message.subarray(21 + keyLength);

  const shared = receiver.computeSecret(senderPublic);
  const info = Buffer.concat([
    Buffer.from('WebPush: info\0'),
    receiver.getPublicKey(),
    senderPublic,
  ]);
  const ikm = Buffer.from(hkdfSync('sha256', shared, auth, info, 32));
  const key = Buffer.from(hkdfSync('sha256', ikm, salt, 'Content-Encoding: aes128gcm\0', 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, 'Content-Encoding: nonce\0', 12));

  const decipher = createDecipheriv('aes-128-gcm', key, nonce);
  decipher.setAuthTag(ciphertext.subarray(-16));
  const padded = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
  // O texto termina no delimitador 0x02 (último registro), seguido de zeros opcionais.
  const end = padded.findLastIndex((byte) => byte !== 0);
  expect(padded[end]).toBe(2);
  return padded.subarray(0, end).toString('utf8');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('base64url', () => {
  it('vai e volta, sem preenchimento', () => {
    const bytes = new Uint8Array([0, 250, 251, 252, 253, 254, 255]);
    expect(toBase64Url(bytes)).toBe('APr7_P3-_w');
    expect([...fromBase64Url('APr7_P3-_w')]).toEqual([...bytes]);
  });
});

describe('criptografia da mensagem (RFC 8291)', () => {
  it('o decifrador de teste entende a biblioteca de referência (web-push)', () => {
    const browser = fakeBrowser();
    const reference = webpush.encrypt(
      browser.subscription.p256dh,
      browser.subscription.auth,
      'mensagem de referência',
      webpush.supportedContentEncodings.AES_128_GCM,
    );
    expect(decrypt(reference.cipherText, browser.ecdh, browser.auth)).toBe(
      'mensagem de referência',
    );
  });

  it('o que o Boldo cifra, o navegador decifra', async () => {
    const browser = fakeBrowser();
    const text = JSON.stringify({ ...payload, title: 'Hora de tomar Losartana (ção, ã, 💊)' });
    const body = await encryptPayload(
      new TextEncoder().encode(text),
      browser.subscription.p256dh,
      browser.subscription.auth,
    );
    expect(decrypt(body, browser.ecdh, browser.auth)).toBe(text);
  });

  it('monta o cabeçalho aes128gcm: sal, tamanho de registro 4096 e chave de 65 bytes', async () => {
    const browser = fakeBrowser();
    const body = await encryptPayload(
      new Uint8Array([1, 2, 3]),
      browser.subscription.p256dh,
      browser.subscription.auth,
    );
    expect(Buffer.from(body).readUInt32BE(16)).toBe(4096);
    expect(body[20]).toBe(65);
    expect(body[21]).toBe(4); // ponto não comprimido
    // cabeçalho (86) + texto (3) + delimitador (1) + etiqueta GCM (16)
    expect(body.length).toBe(86 + 3 + 1 + 16);
  });

  it('cada envio usa sal e chave novos', async () => {
    const browser = fakeBrowser();
    const encrypt = () =>
      encryptPayload(
        new Uint8Array([1, 2, 3]),
        browser.subscription.p256dh,
        browser.subscription.auth,
      );
    expect(Buffer.from(await encrypt()).equals(Buffer.from(await encrypt()))).toBe(false);
  });

  it('outro aparelho não consegue ler', async () => {
    const browser = fakeBrowser();
    const stranger = fakeBrowser();
    const body = await encryptPayload(
      new Uint8Array([1, 2, 3]),
      browser.subscription.p256dh,
      browser.subscription.auth,
    );
    expect(() => decrypt(body, stranger.ecdh, stranger.auth)).toThrow();
  });
});

describe('VAPID (RFC 8292)', () => {
  it('gera chaves no formato que os navegadores e a web-push esperam', async () => {
    const keys = await generateVapidKeys();
    expect(fromBase64Url(keys.publicKey)).toHaveLength(65);
    expect(fromBase64Url(keys.privateKey)).toHaveLength(32);
    // A biblioteca de referência valida o formato e recusa chaves malformadas.
    expect(() =>
      webpush.getVapidHeaders(
        'https://push.example',
        SUBJECT,
        keys.publicKey,
        keys.privateKey,
        webpush.supportedContentEncodings.AES_128_GCM,
      ),
    ).not.toThrow();
  });

  it('assina um JWT que a chave pública confere', async () => {
    const keys = await generateVapidKeys();
    const header = await vapidAuthorization(
      'https://push.example/send/abc?x=1',
      keys,
      SUBJECT,
      1_800_000_000,
    );
    const match = header.match(/^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/);
    expect(match).not.toBeNull();
    const [, head, claims, signature, key] = match!;
    expect(key).toBe(keys.publicKey);

    const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString());
    expect(decode(head)).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(decode(claims)).toEqual({
      aud: 'https://push.example',
      exp: 1_800_000_000 + 12 * 3600,
      sub: SUBJECT,
    });

    const publicKey = await crypto.subtle.importKey(
      'raw',
      fromBase64Url(keys.publicKey),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      fromBase64Url(signature),
      new TextEncoder().encode(`${head}.${claims}`),
    );
    expect(valid).toBe(true);
  });

  it('as chaves são geradas uma vez e reaproveitadas', async () => {
    const store = await memoryStore();
    const first = await ensureVapidKeys(store);
    expect(await ensureVapidKeys(store)).toEqual(first);
  });
});

describe('envio', () => {
  const setup = async (respond: () => Promise<Response>) => {
    const store = await memoryStore();
    const browser = fakeBrowser();
    await store.saveSubscription(browser.subscription, 'agora');
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() => respond());
    vi.stubGlobal('fetch', fetchMock);
    const sender = createWebPushSender(store, await generateVapidKeys(), SUBJECT);
    return { store, browser, fetchMock, sender };
  };

  it('sem aparelhos inscritos, não envia nada', async () => {
    const store = await memoryStore();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const sender = createWebPushSender(store, await generateVapidKeys(), SUBJECT);
    expect(await sender.send(payload)).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('manda a mensagem cifrada, com os cabeçalhos do padrão, e o aparelho consegue ler', async () => {
    const { browser, fetchMock, sender } = await setup(
      async () => new Response(null, { status: 201 }),
    );
    expect(await sender.send(payload)).toBe(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(browser.subscription.endpoint);
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Encoding']).toBe('aes128gcm');
    expect(headers.TTL).toBe('3600');
    expect(headers.Authorization).toMatch(/^vapid t=.+, k=.+$/);
    expect(JSON.parse(decrypt(init.body as Uint8Array, browser.ecdh, browser.auth))).toEqual(
      payload,
    );
  });

  it('apaga a inscrição que o navegador cancelou (410)', async () => {
    const { store, sender } = await setup(async () => new Response(null, { status: 410 }));
    expect(await sender.send(payload)).toBe(0);
    expect(await store.countSubscriptions()).toBe(0);
  });

  it('recusa temporária ou falha de rede não derruba nada nem apaga a inscrição', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const refused = await setup(async () => new Response('limite', { status: 429 }));
    expect(await refused.sender.send(payload)).toBe(0);
    expect(await refused.store.countSubscriptions()).toBe(1);

    const offline = await setup(async () => {
      throw new TypeError('fetch failed');
    });
    expect(await offline.sender.send(payload)).toBe(0);
    expect(await offline.store.countSubscriptions()).toBe(1);
  });
});
