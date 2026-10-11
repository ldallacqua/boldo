import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function sameText(a: string, b: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

/**
 * Assinaturas HMAC com um segredo só. Dois usos:
 * - sessão: o app guarda o token e manda em `Authorization: Bearer`;
 * - dose: vai dentro do lembrete e autoriza UMA ação (tomar aquela dose naquele dia), para o
 *   botão "Tomei" da notificação funcionar sem o service worker precisar da sessão.
 */
export function createTokens(secret: string) {
  const sign = (message: string) =>
    createHmac('sha256', secret).update(message).digest('base64url');

  return {
    session(expiresAtMs: number): string {
      return `${expiresAtMs}.${sign(`session:${expiresAtMs}`)}`;
    },

    isValidSession(token: string | undefined, nowMs: number): boolean {
      const [expires, signature, ...rest] = (token ?? '').split('.');
      if (!expires || !signature || rest.length > 0) return false;
      if (!/^\d+$/.test(expires) || Number(expires) <= nowMs) return false;
      return sameText(signature, sign(`session:${expires}`));
    },

    dose(scheduleId: number, date: string): string {
      return sign(`dose:${scheduleId}:${date}`);
    },

    isValidDose(scheduleId: number, date: string, token: unknown): boolean {
      return typeof token === 'string' && sameText(token, sign(`dose:${scheduleId}:${date}`));
    },
  };
}

export type Tokens = ReturnType<typeof createTokens>;
