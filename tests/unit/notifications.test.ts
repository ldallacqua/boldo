import { describe, expect, it, vi } from 'vitest';
import type { PushPayload } from '../../shared/types';
import { appUrl, handleNotificationClick, toNotification } from '../../src/lib/notifications';

const dosePayload: PushPayload = {
  title: 'Hora de tomar Losartana',
  body: '1 comprimido (50 mg) às 08:00',
  tag: 'dose-7-2026-10-12',
  url: '/',
  dose: { scheduleId: 7, date: '2026-10-12', token: 'assinatura' },
};

/** O app publicado em uma subpasta, como no GitHub Pages. */
const SCOPE = 'https://exemplo.github.io/boldo/';

const stockPayload: PushPayload = {
  title: 'Dipirona está acabando',
  body: 'Restam 4 comprimidos.',
  tag: 'stock-3',
  url: '/remedios/3',
};

const effects = (takeDose: () => Promise<boolean> = async () => true) => ({
  takeDose: vi.fn(takeDose),
  refresh: vi.fn(async () => {}),
  open: vi.fn(async () => {}),
});

describe('toNotification', () => {
  it('lembrete de dose vem com o botão "Tomei"', () => {
    expect(toNotification(dosePayload, SCOPE)).toEqual({
      title: 'Hora de tomar Losartana',
      options: {
        body: '1 comprimido (50 mg) às 08:00',
        tag: 'dose-7-2026-10-12',
        icon: 'https://exemplo.github.io/boldo/icons/icon-192.png',
        badge: 'https://exemplo.github.io/boldo/icons/badge-96.png',
        lang: 'pt-BR',
        data: dosePayload,
        actions: [{ action: 'take', title: 'Tomei' }],
      },
    });
  });

  it('aviso de estoque não tem botão', () => {
    expect(toNotification(stockPayload, SCOPE).options.actions).toEqual([]);
  });

  it('resolve os endereços dos avisos dentro da pasta do app', () => {
    expect(appUrl('/remedios/3', SCOPE)).toBe('https://exemplo.github.io/boldo/remedios/3');
    expect(appUrl('/', SCOPE)).toBe(SCOPE);
    expect(appUrl('/remedios/3', 'https://boldo.example/')).toBe(
      'https://boldo.example/remedios/3',
    );
  });
});

describe('handleNotificationClick', () => {
  it('"Tomei" registra a dose e atualiza as telas abertas, sem abrir o app', async () => {
    const fx = effects();
    await handleNotificationClick('take', dosePayload, fx);
    expect(fx.takeDose).toHaveBeenCalledWith(dosePayload.dose);
    expect(fx.refresh).toHaveBeenCalledOnce();
    expect(fx.open).not.toHaveBeenCalled();
  });

  it('se o servidor recusar, abre o app para registrar lá', async () => {
    const fx = effects(async () => false);
    await handleNotificationClick('take', dosePayload, fx);
    expect(fx.refresh).not.toHaveBeenCalled();
    expect(fx.open).toHaveBeenCalledWith('/');
  });

  it('se estiver sem internet, abre o app em vez de falhar calado', async () => {
    const fx = effects(async () => {
      throw new TypeError('Failed to fetch');
    });
    await handleNotificationClick('take', dosePayload, fx);
    expect(fx.open).toHaveBeenCalledWith('/');
  });

  it('tocar na notificação abre o endereço dela', async () => {
    const dose = effects();
    await handleNotificationClick('', dosePayload, dose);
    expect(dose.takeDose).not.toHaveBeenCalled();
    expect(dose.open).toHaveBeenCalledWith('/');

    const stock = effects();
    await handleNotificationClick('', stockPayload, stock);
    expect(stock.open).toHaveBeenCalledWith('/remedios/3');
  });
});
