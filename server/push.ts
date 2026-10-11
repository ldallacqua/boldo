import webpush from 'web-push';
import type { PushPayload } from '../shared/types';
import type { Store } from './store';

export interface PushSender {
  /** Envia para todos os aparelhos inscritos. Devolve quantos receberam. */
  send(payload: PushPayload): Promise<number>;
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

/** As chaves VAPID são geradas na primeira execução e ficam guardadas no banco. */
export function ensureVapidKeys(store: Store): VapidKeys {
  const publicKey = store.getSetting('vapidPublicKey');
  const privateKey = store.getSetting('vapidPrivateKey');
  if (publicKey && privateKey) return { publicKey, privateKey };

  const generated = webpush.generateVAPIDKeys();
  store.setSetting('vapidPublicKey', generated.publicKey);
  store.setSetting('vapidPrivateKey', generated.privateKey);
  return generated;
}

export function createWebPushSender(store: Store, keys: VapidKeys, subject: string): PushSender {
  return {
    async send(payload) {
      const body = JSON.stringify(payload);
      const results = await Promise.all(
        store.listSubscriptions().map(async (subscription) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: { p256dh: subscription.p256dh, auth: subscription.auth },
              },
              body,
              {
                vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
                TTL: 60 * 60,
                urgency: 'high',
              },
            );
            return true;
          } catch (error) {
            const status = (error as { statusCode?: number }).statusCode;
            // 404/410: o navegador cancelou a inscrição; não adianta tentar de novo.
            if (status === 404 || status === 410) store.deleteSubscription(subscription.endpoint);
            else console.error('[push] falha ao enviar:', status ?? error);
            return false;
          }
        }),
      );
      return results.filter(Boolean).length;
    },
  };
}
