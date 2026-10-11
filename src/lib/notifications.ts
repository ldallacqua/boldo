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

/** `scope` é o endereço-base do app (termina em barra), ex.: https://exemplo.com/boldo/ */
export function toNotification(
  payload: PushPayload,
  scope: string,
): { title: string; options: NotificationOptionsWithActions } {
  return {
    title: payload.title,
    options: {
      body: payload.body,
      tag: payload.tag,
      icon: new URL('icons/icon-192.png', scope).href,
      badge: new URL('icons/badge-96.png', scope).href,
      lang: 'pt-BR',
      data: payload,
      // Só lembrete de dose tem o que responder direto da notificação.
      actions: payload.dose ? [{ action: 'take', title: 'Tomei' }] : [],
    },
  };
}

/** Os endereços dos avisos são relativos à raiz do app ("/remedios/3"), não à do site. */
export function appUrl(path: string, scope: string): string {
  return new URL(path.replace(/^\/+/, ''), scope).href;
}

export interface ClickEffects {
  /** Registra a dose no servidor. Devolve `false` se o servidor recusou. */
  takeDose(dose: NonNullable<PushPayload['dose']>): Promise<boolean>;
  /** Pede às janelas abertas do app que recarreguem os dados. */
  refresh(): Promise<void>;
  /** Abre (ou traz para frente) o app no caminho dado. */
  open(path: string): Promise<void>;
}

export async function handleNotificationClick(
  action: string,
  payload: PushPayload,
  effects: ClickEffects,
): Promise<void> {
  if (action === 'take' && payload.dose) {
    const ok = await effects.takeDose(payload.dose).catch(() => false);
    // Se não deu para registrar em segundo plano, abre o app para a pessoa registrar lá.
    return ok ? effects.refresh() : effects.open('/');
  }
  return effects.open(payload.url || '/');
}
