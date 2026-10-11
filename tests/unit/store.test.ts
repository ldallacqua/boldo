import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Store } from '../../server/store';
import { everyDay, input, memoryStore } from './helpers';

const NOW = '2026-10-12T11:00:00.000Z';
const TODAY = '2026-10-12';

let store: Store;
beforeEach(async () => {
  store = await memoryStore();
});

describe('remédios', () => {
  it('cria e lê de volta com os horários', async () => {
    const created = await store.createMedicine(
      input({ schedules: [{ time: '20:00', days: everyDay, dose: 2 }] }),
      NOW,
    );
    expect(created).toMatchObject({
      name: 'Dipirona',
      quantity: 20,
      lowThreshold: 5,
      expiresOn: '2027-03',
      createdAt: NOW,
    });
    expect(created.schedules).toEqual([
      { id: expect.any(Number), medicineId: created.id, time: '20:00', days: everyDay, dose: 2 },
    ]);
    expect(await store.getMedicine(created.id)).toEqual(created);
  });

  it('lista em ordem alfabética, sem diferenciar maiúsculas', async () => {
    for (const name of ['losartana', 'Dipirona', 'Vitamina D']) {
      await store.createMedicine(input({ name }), NOW);
    }
    expect((await store.listMedicines()).map((m) => m.name)).toEqual([
      'Dipirona',
      'losartana',
      'Vitamina D',
    ]);
  });

  it('atualiza os campos', async () => {
    const { id } = await store.createMedicine(input(), NOW);
    const updated = await store.updateMedicine(
      id,
      input({ name: 'Dipirona gotas', unit: 'gota', notes: 'Novo' }),
      '2026-10-13T00:00:00.000Z',
    );
    expect(updated).toMatchObject({
      name: 'Dipirona gotas',
      unit: 'gota',
      notes: 'Novo',
      createdAt: NOW,
      updatedAt: '2026-10-13T00:00:00.000Z',
    });
  });

  it('ao editar, mantém o id dos horários que ficam, cria os novos e apaga os removidos', async () => {
    const created = await store.createMedicine(
      input({
        schedules: [
          { time: '08:00', days: everyDay, dose: 1 },
          { time: '20:00', days: everyDay, dose: 1 },
        ],
      }),
      NOW,
    );
    const [morning, night] = created.schedules;

    const updated = (await store.updateMedicine(
      created.id,
      input({
        schedules: [
          { id: morning.id, time: '07:30', days: [1, 2, 3, 4, 5], dose: 2 },
          { time: '13:00', days: everyDay, dose: 1 },
        ],
      }),
      NOW,
    ))!;

    expect(updated.schedules.map((s) => s.time)).toEqual(['07:30', '13:00']);
    expect(updated.schedules[0]).toMatchObject({ id: morning.id, days: [1, 2, 3, 4, 5], dose: 2 });
    expect(await store.getSchedule(night.id)).toBeNull();
  });

  it('não deixa um remédio adotar o horário de outro', async () => {
    const a = await store.createMedicine(
      input({ name: 'A', schedules: [{ time: '08:00', days: everyDay, dose: 1 }] }),
      NOW,
    );
    const b = await store.createMedicine(input({ name: 'B' }), NOW);
    await store.updateMedicine(
      b.id,
      input({
        name: 'B',
        schedules: [{ id: a.schedules[0].id, time: '09:00', days: [1], dose: 1 }],
      }),
      NOW,
    );
    expect((await store.getMedicine(a.id))!.schedules[0].time).toBe('08:00');
    expect((await store.getMedicine(b.id))!.schedules).toHaveLength(1);
    expect((await store.getMedicine(b.id))!.schedules[0].id).not.toBe(a.schedules[0].id);
  });

  it('devolve null/false para id que não existe', async () => {
    expect(await store.getMedicine(99)).toBeNull();
    expect(await store.updateMedicine(99, input(), NOW)).toBeNull();
    expect(await store.adjustQuantity(99, 1, NOW)).toBeNull();
    expect(await store.deleteMedicine(99)).toBe(false);
  });

  it('excluir leva junto horários e doses registradas', async () => {
    const created = await store.createMedicine(
      input({ schedules: [{ time: '08:00', days: everyDay, dose: 1 }] }),
      NOW,
    );
    await store.recordIntake(created.schedules[0].id, TODAY, 'taken', NOW);
    expect(await store.deleteMedicine(created.id)).toBe(true);
    expect(await store.getSchedule(created.schedules[0].id)).toBeNull();
    expect(await store.listIntakes(TODAY)).toEqual([]);
  });
});

describe('estoque', () => {
  it('soma e subtrai', async () => {
    const { id } = await store.createMedicine(input({ quantity: 10 }), NOW);
    expect((await store.adjustQuantity(id, 5, NOW))!.quantity).toBe(15);
    expect((await store.adjustQuantity(id, -3, NOW))!.quantity).toBe(12);
  });

  it('nunca fica negativo', async () => {
    const { id } = await store.createMedicine(input({ quantity: 2 }), NOW);
    expect((await store.adjustQuantity(id, -10, NOW))!.quantity).toBe(0);
  });

  it('não acumula erro de ponto flutuante', async () => {
    const { id } = await store.createMedicine(input({ quantity: 0.3, unit: 'ml' }), NOW);
    expect((await store.adjustQuantity(id, -0.1, NOW))!.quantity).toBe(0.2);
  });
});

describe('doses', () => {
  const withSchedule = async (quantity: number, dose: number) => {
    const medicine = await store.createMedicine(
      input({ quantity, schedules: [{ time: '08:00', days: everyDay, dose }] }),
      NOW,
    );
    return { medicine, scheduleId: medicine.schedules[0].id };
  };

  it('tomar desconta a dose do estoque', async () => {
    const { medicine, scheduleId } = await withSchedule(20, 2);
    expect(await store.recordIntake(scheduleId, TODAY, 'taken', NOW)).toBe(true);
    expect((await store.getMedicine(medicine.id))!.quantity).toBe(18);
    expect(await store.listIntakes(TODAY)).toMatchObject([
      { schedule_id: scheduleId, status: 'taken', amount: 2, time: '08:00' },
    ]);
  });

  it('registrar duas vezes não desconta duas vezes', async () => {
    const { medicine, scheduleId } = await withSchedule(20, 2);
    await store.recordIntake(scheduleId, TODAY, 'taken', NOW);
    await store.recordIntake(scheduleId, TODAY, 'taken', NOW);
    expect((await store.getMedicine(medicine.id))!.quantity).toBe(18);
    expect(await store.listIntakes(TODAY)).toHaveLength(1);
  });

  it('pular não mexe no estoque', async () => {
    const { medicine, scheduleId } = await withSchedule(20, 2);
    await store.recordIntake(scheduleId, TODAY, 'skipped', NOW);
    expect((await store.getMedicine(medicine.id))!.quantity).toBe(20);
  });

  it('trocar de tomado para pulado devolve a dose', async () => {
    const { medicine, scheduleId } = await withSchedule(20, 2);
    await store.recordIntake(scheduleId, TODAY, 'taken', NOW);
    await store.recordIntake(scheduleId, TODAY, 'skipped', NOW);
    expect((await store.getMedicine(medicine.id))!.quantity).toBe(20);
  });

  it('desfazer devolve exatamente o que saiu, mesmo com estoque insuficiente', async () => {
    const { medicine, scheduleId } = await withSchedule(1, 2);
    await store.recordIntake(scheduleId, TODAY, 'taken', NOW);
    expect((await store.getMedicine(medicine.id))!.quantity).toBe(0);
    await store.undoIntake(scheduleId, TODAY);
    expect((await store.getMedicine(medicine.id))!.quantity).toBe(1);
    expect(await store.listIntakes(TODAY)).toEqual([]);
  });

  it('dias diferentes são doses diferentes', async () => {
    const { medicine, scheduleId } = await withSchedule(20, 1);
    await store.recordIntake(scheduleId, '2026-10-11', 'taken', NOW);
    await store.recordIntake(scheduleId, TODAY, 'taken', NOW);
    expect((await store.getMedicine(medicine.id))!.quantity).toBe(18);
  });

  it('recusa horário que não existe', async () => {
    expect(await store.recordIntake(999, TODAY, 'taken', NOW)).toBe(false);
  });
});

describe('ajustes e notificações', () => {
  it('começa com os ajustes padrão e guarda os novos', async () => {
    expect(await store.getSettings()).toEqual(DEFAULT_SETTINGS);
    await store.saveSettings({ expiryWarnDays: 60, alertTime: '07:30' });
    expect(await store.getSettings()).toEqual({ expiryWarnDays: 60, alertTime: '07:30' });
  });

  it('inscreve cada aparelho uma vez só', async () => {
    const subscription = { endpoint: 'https://push.example/1', p256dh: 'a', auth: 'b' };
    await store.saveSubscription(subscription, NOW);
    await store.saveSubscription({ ...subscription, auth: 'c' }, NOW);
    expect(await store.listSubscriptions()).toEqual([{ ...subscription, auth: 'c' }]);
    await store.deleteSubscription(subscription.endpoint);
    expect(await store.countSubscriptions()).toBe(0);
  });

  it('cada aviso só pode ser reivindicado uma vez', async () => {
    expect(await store.claimNotification('dose:1:2026-10-12', NOW)).toBe(true);
    expect(await store.claimNotification('dose:1:2026-10-12', NOW)).toBe(false);
    await store.pruneNotificationLog('2026-10-13T00:00:00.000Z');
    expect(await store.claimNotification('dose:1:2026-10-12', NOW)).toBe(true);
  });
});

describe('valores gerados uma vez', () => {
  it('getOrCreateSetting só gera na primeira chamada', async () => {
    let calls = 0;
    const create = () => `valor-${(calls += 1)}`;
    expect(await store.getOrCreateSetting('segredo', create)).toBe('valor-1');
    expect(await store.getOrCreateSetting('segredo', create)).toBe('valor-1');
    expect(calls).toBe(1);
  });
});

describe('tentativas de senha', () => {
  it('conta por cliente e esquece quando a janela passa', async () => {
    await store.recordLoginFailure('1.1.1.1', 1000, 500);
    await store.recordLoginFailure('1.1.1.1', 1200, 500);
    await store.recordLoginFailure('2.2.2.2', 1200, 500);
    expect(await store.loginFailures('1.1.1.1', 1300)).toBe(2);
    expect(await store.loginFailures('2.2.2.2', 1300)).toBe(1);
    // A janela conta a partir do primeiro erro, não do último.
    expect(await store.loginFailures('1.1.1.1', 1500)).toBe(0);
    expect(await store.loginFailures('2.2.2.2', 1500)).toBe(1);
  });

  it('acertar limpa só aquele cliente', async () => {
    await store.recordLoginFailure('1.1.1.1', 1000, 500);
    await store.recordLoginFailure('2.2.2.2', 1000, 500);
    await store.clearLoginFailures('1.1.1.1');
    expect(await store.loginFailures('1.1.1.1', 1100)).toBe(0);
    expect(await store.loginFailures('2.2.2.2', 1100)).toBe(1);
  });
});
