import type { PushPayload } from '../shared/types';
import type { Store } from './store';

/**
 * Web Push sem dependências, só com Web Crypto e fetch, para rodar igual no Node e nas
 * Edge Functions (Deno). Segue a RFC 8291 (criptografia da mensagem, aes128gcm) e a
 * RFC 8292 (VAPID, identificação do servidor).
 */

export interface PushSender {
  /**
   * Envia para os aparelhos inscritos e devolve quantos receberam. Com `medicineId`, ficam
   * de fora os aparelhos que silenciaram esse remédio.
   */
  send(payload: PushPayload, medicineId?: number): Promise<number>;
}

export interface VapidKeys {
  /** Ponto P-256 não comprimido (65 bytes) em base64url; é o que o navegador recebe. */
  publicKey: string;
  /** Escalar privado (32 bytes) em base64url. */
  privateKey: string;
}

type Bytes = Uint8Array<ArrayBuffer>;

const text = new TextEncoder();

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string): Bytes {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(new ArrayBuffer(parts.reduce((sum, part) => sum + part.length, 0)));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
  ]);
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return { publicKey: toBase64Url(publicKey), privateKey: jwk.d! };
}

/** As chaves VAPID são geradas na primeira execução e ficam guardadas no banco. */
export async function ensureVapidKeys(store: Store): Promise<VapidKeys> {
  // Um par só, gravado de uma vez: público e privado nunca podem ficar descasados.
  const stored = await store.getOrCreateSetting('vapidKeys', async () =>
    JSON.stringify(await generateVapidKeys()),
  );
  return JSON.parse(stored) as VapidKeys;
}

/** Cabeçalho Authorization que prova ao serviço de push quem está enviando. */
export async function vapidAuthorization(
  endpoint: string,
  keys: VapidKeys,
  subject: string,
  nowSeconds: number,
): Promise<string> {
  const publicKey = fromBase64Url(keys.publicKey);
  const signingKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: toBase64Url(publicKey.slice(1, 33)),
      y: toBase64Url(publicKey.slice(33, 65)),
      d: keys.privateKey,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const encode = (value: object) => toBase64Url(text.encode(JSON.stringify(value)));
  const unsigned = `${encode({ typ: 'JWT', alg: 'ES256' })}.${encode({
    aud: new URL(endpoint).origin,
    exp: nowSeconds + 12 * 60 * 60,
    sub: subject,
  })}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingKey,
    text.encode(unsigned),
  );
  return `vapid t=${unsigned}.${toBase64Url(new Uint8Array(signature))}, k=${keys.publicKey}`;
}

export interface EncryptionOverrides {
  /** Só para testes com vetores conhecidos; em produção, par e sal são aleatórios. */
  localKeys?: CryptoKeyPair;
  salt?: Bytes;
}

/** Criptografa a mensagem para um aparelho (RFC 8291, Content-Encoding: aes128gcm). */
export async function encryptPayload(
  payload: Uint8Array,
  p256dh: string,
  auth: string,
  overrides: EncryptionOverrides = {},
): Promise<Bytes> {
  const receiverPublic = fromBase64Url(p256dh);
  const authSecret = fromBase64Url(auth);
  const ecdh = { name: 'ECDH', namedCurve: 'P-256' };

  const local =
    overrides.localKeys ?? (await crypto.subtle.generateKey(ecdh, true, ['deriveBits']));
  const localPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const receiverKey = await crypto.subtle.importKey('raw', receiverPublic, ecdh, false, []);
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: receiverKey }, local.privateKey, 256),
  );

  const ikm = await hkdf(
    authSecret,
    shared,
    concat(text.encode('WebPush: info\0'), receiverPublic, localPublic),
    32,
  );
  const salt = overrides.salt ?? crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const contentKey = await hkdf(salt, ikm, text.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, text.encode('Content-Encoding: nonce\0'), 12);

  const aesKey = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt']);
  // 0x02 marca o fim do último (e único) registro.
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      aesKey,
      concat(payload, new Uint8Array([2])),
    ),
  );

  // Cabeçalho: sal (16) | tamanho do registro (4, big-endian) | tamanho da chave (1) | chave.
  const recordSize = new Uint8Array([0, 0, 16, 0]);
  return concat(salt, recordSize, new Uint8Array([localPublic.length]), localPublic, ciphertext);
}

export function createWebPushSender(
  store: Store,
  keys: VapidKeys,
  subject: string,
  now: () => Date = () => new Date(),
): PushSender {
  return {
    async send(payload, medicineId) {
      const message = text.encode(JSON.stringify(payload));
      const subscriptions = (await store.listSubscriptions()).filter(
        (device) => medicineId === undefined || !device.mutedMedicines.includes(medicineId),
      );
      const results = await Promise.all(
        subscriptions.map(async (subscription) => {
          try {
            const response = await fetch(subscription.endpoint, {
              method: 'POST',
              headers: {
                Authorization: await vapidAuthorization(
                  subscription.endpoint,
                  keys,
                  subject,
                  Math.floor(now().getTime() / 1000),
                ),
                'Content-Encoding': 'aes128gcm',
                'Content-Type': 'application/octet-stream',
                TTL: '3600',
                Urgency: 'high',
              },
              body: await encryptPayload(message, subscription.p256dh, subscription.auth),
              signal: AbortSignal.timeout(10_000),
            });
            if (response.ok) return true;
            // 404/410: o navegador cancelou a inscrição; não adianta tentar de novo.
            if (response.status === 404 || response.status === 410) {
              await store.deleteSubscription(subscription.endpoint);
            } else {
              console.error('[push] recusado:', response.status, await response.text());
            }
            return false;
          } catch (error) {
            console.error('[push] falha ao enviar:', error);
            return false;
          }
        }),
      );
      return results.filter(Boolean).length;
    },
  };
}
