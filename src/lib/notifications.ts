import type { PushPayload } from '../../shared/types';

/** Lógica do service worker separada dele, para poder ser testada sem um navegador. */

export interface NotificationAction {
  action: string;
  title: string;
}

// `actions` existe nos navegadores, mas ainda não está nos tipos do DOM.
export type NotificationOptionsWithActions = NotificationOptions & {
  actions: NotificationAction[];
};

export function toNotification(payload: PushPayload): {
  title: string;
  options: NotificationOptionsWithActions;
} {
  return {
    title: payload.title,
    options: {
      body: payload.body,
      tag: payload.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      lang: 'pt-BR',
      data: payload,
      // Só lembrete de dose tem o que responder direto da notificação.
      actions: payload.dose ? [{ action: 'take', title: 'Tomei' }] : [],
    },
  };
}

export interface ClickEffects {
  /** Registra a dose no servidor. Devolve `false` se o servidor recusou (ex.: sessão expirada). */
  takeDose(scheduleId: number, date: string): Promise<boolean>;
  /** Pede às janelas abertas do app que recarreguem os dados. */
  refresh(): Promise<void>;
  /** Abre (ou traz para frente) o app no endereço dado. */
  open(url: string): Promise<void>;
}

export async function handleNotificationClick(
  action: string,
  payload: PushPayload,
  effects: ClickEffects,
): Promise<void> {
  if (action === 'take' && payload.dose) {
    const ok = await effects
      .takeDose(payload.dose.scheduleId, payload.dose.date)
      .catch(() => false);
    // Se não deu para registrar em segundo plano, abre o app para a pessoa registrar lá.
    return ok ? effects.refresh() : effects.open('/');
  }
  return effects.open(payload.url || '/');
}
