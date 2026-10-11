import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../server/app';
import { everyDay, input, PASSWORD, testApp } from './helpers';

let t: ReturnType<typeof testApp>;
beforeEach(() => {
  // 12/10/2026 (segunda) às 08:00 em São Paulo.
  t = testApp('2026-10-12T11:00:00Z');
});

describe('sessão', () => {
  it('a API exige senha', async () => {
    for (const path of ['/api/medicines', '/api/today', '/api/settings', '/api/export']) {
      const { status, body } = await t.call('GET', path);
      expect(status, path).toBe(401);
      expect(body.error).toBe('Entre com a senha.');
    }
  });

  it('saúde e sessão respondem sem senha', async () => {
    expect((await t.call('GET', '/api/health')).body).toEqual({ ok: true });
    expect((await t.call('GET', '/api/session')).body).toEqual({ authenticated: false });
  });

  it('recusa senha errada', async () => {
    const { status, body } = await t.call('POST', '/api/login', { password: 'errada' });
    expect(status).toBe(401);
    expect(body.error).toBe('Senha incorreta.');
    expect((await t.call('GET', '/api/session')).body).toEqual({ authenticated: false });
  });

  it('entra com a senha certa e recebe um cookie protegido', async () => {
    const { status, response } = await t.login();
    expect(status).toBe(200);
    const cookie = response.headers.get('set-cookie')!;
    expect(cookie).toMatch(/^boldo_session=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect((await t.call('GET', '/api/session')).body).toEqual({ authenticated: true });
    expect((await t.call('GET', '/api/medicines')).status).toBe(200);
  });

  it('sair encerra a sessão', async () => {
    await t.login();
    await t.call('POST', '/api/logout');
    t.forgetSession();
    expect((await t.call('GET', '/api/medicines')).status).toBe(401);
  });

  it('a sessão expira depois de 180 dias', async () => {
    await t.login();
    t.clock.now = new Date('2027-04-09T11:00:00Z');
    expect((await t.call('GET', '/api/session')).body).toEqual({ authenticated: true });
    t.clock.now = new Date('2027-04-11T11:00:00Z');
    expect((await t.call('GET', '/api/session')).body).toEqual({ authenticated: false });
  });

  it('trocar a senha derruba as sessões abertas', async () => {
    const { response } = await t.login();
    const cookie = response.headers.get('set-cookie')!.split(';')[0];

    const withNewPassword = createApp({
      store: t.store,
      sender: t.sender,
      password: 'senha-nova',
      sessionSecret: 'segredo-de-teste',
      timezone: 'UTC',
      vapidPublicKey: '',
    });
    const result = await withNewPassword.request('/api/medicines', { headers: { Cookie: cookie } });
    expect(result.status).toBe(401);
  });

  it('recusa cookie adulterado', async () => {
    await t.login();
    const farFuture = String(Date.parse('2099-01-01'));
    const result = await t.call('GET', '/api/session');
    expect(result.body).toEqual({ authenticated: true });

    const { store, sender } = t;
    const app = createApp({
      store,
      sender,
      password: PASSWORD,
      sessionSecret: 'segredo-de-teste',
      timezone: 'UTC',
      vapidPublicKey: '',
    });
    const forged = await app.request('/api/medicines', {
      headers: { Cookie: `boldo_session=${farFuture}.assinatura-falsa` },
    });
    expect(forged.status).toBe(401);
  });

  it('bloqueia depois de muitas senhas erradas e libera após 15 minutos', async () => {
    for (let i = 0; i < 8; i += 1) {
      expect((await t.call('POST', '/api/login', { password: 'errada' })).status).toBe(401);
    }
    const blocked = await t.login();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/Muitas tentativas/);

    t.clock.now = new Date(t.clock.now.getTime() + 16 * 60_000);
    expect((await t.login()).status).toBe(200);
  });
});

describe('remédios', () => {
  beforeEach(() => t.login());

  it('cadastra, lista, edita e exclui', async () => {
    const created = await t.call('POST', '/api/medicines', input());
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ id: 1, name: 'Dipirona', quantity: 20 });

    const list = await t.call('GET', '/api/medicines');
    expect(list.body).toHaveLength(1);

    const updated = await t.call('PUT', '/api/medicines/1', input({ notes: 'Gaveta' }));
    expect(updated.body.notes).toBe('Gaveta');

    expect((await t.call('DELETE', '/api/medicines/1')).body).toEqual({ ok: true });
    expect((await t.call('GET', '/api/medicines')).body).toEqual([]);
  });

  it('explica o que está errado no cadastro', async () => {
    const { status, body } = await t.call('POST', '/api/medicines', input({ name: '' }));
    expect(status).toBe(400);
    expect(body.error).toBe('Informe o nome do remédio.');
  });

  it('recusa corpo que não é JSON', async () => {
    const { status } = await t.call('POST', '/api/medicines');
    expect(status).toBe(400);
  });

  it('responde 404 para remédio que não existe', async () => {
    expect((await t.call('PUT', '/api/medicines/99', input())).status).toBe(404);
    expect((await t.call('DELETE', '/api/medicines/99')).status).toBe(404);
    expect((await t.call('DELETE', '/api/medicines/abc')).status).toBe(404);
    expect((await t.call('POST', '/api/medicines/99/adjust', { delta: 1 })).status).toBe(404);
  });

  it('ajusta o estoque sem deixar negativo', async () => {
    await t.call('POST', '/api/medicines', input({ quantity: 2 }));
    expect((await t.call('POST', '/api/medicines/1/adjust', { delta: 3 })).body.quantity).toBe(5);
    expect((await t.call('POST', '/api/medicines/1/adjust', { delta: -9 })).body.quantity).toBe(0);
    expect((await t.call('POST', '/api/medicines/1/adjust', { delta: 'x' })).status).toBe(400);
  });
});

describe('doses de hoje', () => {
  beforeEach(async () => {
    await t.login();
    await t.call(
      'POST',
      '/api/medicines',
      input({
        name: 'Losartana',
        quantity: 28,
        schedules: [
          { time: '20:00', days: everyDay, dose: 1 },
          { time: '07:00', days: everyDay, dose: 1 },
          { time: '08:00', days: [0, 6], dose: 1 },
        ],
      }),
    );
  });

  it('lista as doses do dia em ordem de horário, no fuso do servidor', async () => {
    const { body } = await t.call('GET', '/api/today');
    expect(body.date).toBe('2026-10-12');
    expect(body.time).toBe('08:00');
    // O horário de fim de semana não entra numa segunda.
    expect(body.doses.map((d: { time: string }) => d.time)).toEqual(['07:00', '20:00']);
    expect(body.doses[0]).toMatchObject({
      medicineName: 'Losartana',
      dose: 1,
      unit: 'comprimido',
      status: 'late',
      recordedAt: null,
    });
    expect(body.doses[1].status).toBe('pending');
  });

  it('tomar marca a dose e desconta do estoque; desfazer devolve', async () => {
    const { body: today } = await t.call('GET', '/api/today');
    const id = today.doses[0].scheduleId;

    expect((await t.call('POST', `/api/doses/${id}/take`, {})).status).toBe(200);
    const after = await t.call('GET', '/api/today');
    expect(after.body.doses[0]).toMatchObject({
      status: 'taken',
      recordedAt: '2026-10-12T11:00:00.000Z',
    });
    expect((await t.call('GET', '/api/medicines')).body[0].quantity).toBe(27);

    await t.call('POST', `/api/doses/${id}/undo`, {});
    expect((await t.call('GET', '/api/today')).body.doses[0].status).toBe('late');
    expect((await t.call('GET', '/api/medicines')).body[0].quantity).toBe(28);
  });

  it('pular marca sem descontar', async () => {
    const { body: today } = await t.call('GET', '/api/today');
    await t.call('POST', `/api/doses/${today.doses[0].scheduleId}/skip`, {});
    expect((await t.call('GET', '/api/today')).body.doses[0].status).toBe('skipped');
    expect((await t.call('GET', '/api/medicines')).body[0].quantity).toBe(28);
  });

  it('aceita a dose de ontem (notificação respondida depois da meia-noite), mas não mais antiga', async () => {
    const { body: today } = await t.call('GET', '/api/today');
    const id = today.doses[0].scheduleId;
    expect((await t.call('POST', `/api/doses/${id}/take`, { date: '2026-10-11' })).status).toBe(
      200,
    );
    expect((await t.call('POST', `/api/doses/${id}/take`, { date: '2026-10-10' })).status).toBe(
      400,
    );
    expect((await t.call('POST', `/api/doses/${id}/take`, { date: '2026-10-13' })).status).toBe(
      400,
    );
    expect((await t.call('POST', `/api/doses/${id}/take`, { date: 'ontem' })).status).toBe(400);
  });

  it('responde 404 para horário apagado e para ação desconhecida', async () => {
    expect((await t.call('POST', '/api/doses/999/take', {})).status).toBe(404);
    expect((await t.call('POST', '/api/doses/1/explode', {})).status).toBe(404);
  });
});

describe('ajustes e notificações', () => {
  beforeEach(() => t.login());

  it('devolve os ajustes com fuso e chave pública', async () => {
    expect((await t.call('GET', '/api/settings')).body).toEqual({
      expiryWarnDays: 30,
      alertTime: '09:00',
      timezone: 'America/Sao_Paulo',
      vapidPublicKey: 'chave-publica',
      devices: 0,
    });
  });

  it('salva ajustes válidos e recusa inválidos', async () => {
    const saved = await t.call('PUT', '/api/settings', { expiryWarnDays: 60, alertTime: '07:30' });
    expect(saved.body).toMatchObject({ expiryWarnDays: 60, alertTime: '07:30' });
    const bad = await t.call('PUT', '/api/settings', { expiryWarnDays: 0, alertTime: '07:30' });
    expect(bad.status).toBe(400);
  });

  it('inscreve e remove um aparelho', async () => {
    const subscription = {
      endpoint: 'https://push.example/abc',
      keys: { p256dh: 'chave', auth: 'segredo' },
    };
    const added = await t.call('POST', '/api/push/subscribe', subscription);
    expect(added.status).toBe(201);
    expect(added.body).toEqual({ devices: 1 });

    const removed = await t.call('POST', '/api/push/unsubscribe', {
      endpoint: subscription.endpoint,
    });
    expect(removed.body).toEqual({ devices: 0 });
  });

  it('recusa inscrição incompleta ou sem https', async () => {
    const bad = [
      {},
      { endpoint: 'https://push.example/abc' },
      { endpoint: 'http://push.example/abc', keys: { p256dh: 'a', auth: 'b' } },
    ];
    for (const body of bad) {
      expect((await t.call('POST', '/api/push/subscribe', body)).status).toBe(400);
    }
  });

  it('envia a notificação de teste', async () => {
    const { body } = await t.call('POST', '/api/push/test');
    expect(body).toEqual({ delivered: 1 });
    expect(t.sender.sent[0]).toMatchObject({ title: 'Lembretes funcionando', url: '/ajustes' });
  });

  it('exporta tudo como arquivo', async () => {
    await t.call('POST', '/api/medicines', input());
    const { body, response } = await t.call('GET', '/api/export');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="boldo-2026-10-12.json"',
    );
    expect(body.medicines).toHaveLength(1);
    expect(body.settings).toEqual({ expiryWarnDays: 30, alertTime: '09:00' });
    // As chaves de push e o segredo de sessão nunca saem no export.
    expect(JSON.stringify(body)).not.toMatch(/vapid|sessionSecret/i);
  });

  it('rota desconhecida da API responde 404 em JSON', async () => {
    const { status, body } = await t.call('GET', '/api/nada');
    expect(status).toBe(404);
    expect(body.error).toBe('Rota não encontrada.');
  });
});
