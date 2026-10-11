import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Store } from '../../server/store';
import { everyDay, input, memoryStore } from './helpers';

const NOW = '2026-10-12T11:00:00.000Z';
const TODAY = '2026-10-12';

let store: Store;
beforeEach(() => {
  store = memoryStore();
});

describe('remédios', () => {
  it('cria e lê de volta com os horários', () => {
    const created = store.createMedicine(
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
    expect(store.getMedicine(created.id)).toEqual(created);
  });

  it('lista em ordem alfabética, sem diferenciar maiúsculas', () => {
    for (const name of ['losartana', 'Dipirona', 'Vitamina D']) {
      store.createMedicine(input({ name }), NOW);
    }
    expect(store.listMedicines().map((m) => m.name)).toEqual([
      'Dipirona',
      'losartana',
      'Vitamina D',
    ]);
  });

  it('atualiza os campos', () => {
    const { id } = store.createMedicine(input(), NOW);
    const updated = store.updateMedicine(
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

  it('ao editar, mantém o id dos horários que ficam, cria os novos e apaga os removidos', () => {
    const created = store.createMedicine(
      input({
        schedules: [
          { time: '08:00', days: everyDay, dose: 1 },
          { time: '20:00', days: everyDay, dose: 1 },
        ],
      }),
      NOW,
    );
    const [morning, night] = created.schedules;

    const updated = store.updateMedicine(
      created.id,
      input({
        schedules: [
          { id: morning.id, time: '07:30', days: [1, 2, 3, 4, 5], dose: 2 },
          { time: '13:00', days: everyDay, dose: 1 },
        ],
      }),
      NOW,
    )!;

    expect(updated.schedules.map((s) => s.time)).toEqual(['07:30', '13:00']);
    expect(updated.schedules[0]).toMatchObject({ id: morning.id, days: [1, 2, 3, 4, 5], dose: 2 });
    expect(store.getSchedule(night.id)).toBeNull();
  });

  it('não deixa um remédio adotar o horário de outro', () => {
    const a = store.createMedicine(
      input({ name: 'A', schedules: [{ time: '08:00', days: everyDay, dose: 1 }] }),
      NOW,
    );
    const b = store.createMedicine(input({ name: 'B' }), NOW);
    store.updateMedicine(
      b.id,
      input({
        name: 'B',
        schedules: [{ id: a.schedules[0].id, time: '09:00', days: [1], dose: 1 }],
      }),
      NOW,
    );
    expect(store.getMedicine(a.id)!.schedules[0].time).toBe('08:00');
    expect(store.getMedicine(b.id)!.schedules).toHaveLength(1);
    expect(store.getMedicine(b.id)!.schedules[0].id).not.toBe(a.schedules[0].id);
  });

  it('devolve null/false para id que não existe', () => {
    expect(store.getMedicine(99)).toBeNull();
    expect(store.updateMedicine(99, input(), NOW)).toBeNull();
    expect(store.adjustQuantity(99, 1, NOW)).toBeNull();
    expect(store.deleteMedicine(99)).toBe(false);
  });

  it('excluir leva junto horários e doses registradas', () => {
    const created = store.createMedicine(
      input({ schedules: [{ time: '08:00', days: everyDay, dose: 1 }] }),
      NOW,
    );
    store.recordIntake(created.schedules[0].id, TODAY, 'taken', NOW);
    expect(store.deleteMedicine(created.id)).toBe(true);
    expect(store.getSchedule(created.schedules[0].id)).toBeNull();
    expect(store.listIntakes(TODAY)).toEqual([]);
  });
});

describe('estoque', () => {
  it('soma e subtrai', () => {
    const { id } = store.createMedicine(input({ quantity: 10 }), NOW);
    expect(store.adjustQuantity(id, 5, NOW)!.quantity).toBe(15);
    expect(store.adjustQuantity(id, -3, NOW)!.quantity).toBe(12);
  });

  it('nunca fica negativo', () => {
    const { id } = store.createMedicine(input({ quantity: 2 }), NOW);
    expect(store.adjustQuantity(id, -10, NOW)!.quantity).toBe(0);
  });

  it('não acumula erro de ponto flutuante', () => {
    const { id } = store.createMedicine(input({ quantity: 0.3, unit: 'ml' }), NOW);
    expect(store.adjustQuantity(id, -0.1, NOW)!.quantity).toBe(0.2);
  });
});

describe('doses', () => {
  const withSchedule = (quantity: number, dose: number) => {
    const medicine = store.createMedicine(
      input({ quantity, schedules: [{ time: '08:00', days: everyDay, dose }] }),
      NOW,
    );
    return { medicine, scheduleId: medicine.schedules[0].id };
  };

  it('tomar desconta a dose do estoque', () => {
    const { medicine, scheduleId } = withSchedule(20, 2);
    expect(store.recordIntake(scheduleId, TODAY, 'taken', NOW)).toBe(true);
    expect(store.getMedicine(medicine.id)!.quantity).toBe(18);
    expect(store.listIntakes(TODAY)).toMatchObject([
      { schedule_id: scheduleId, status: 'taken', amount: 2, time: '08:00' },
    ]);
  });

  it('registrar duas vezes não desconta duas vezes', () => {
    const { medicine, scheduleId } = withSchedule(20, 2);
    store.recordIntake(scheduleId, TODAY, 'taken', NOW);
    store.recordIntake(scheduleId, TODAY, 'taken', NOW);
    expect(store.getMedicine(medicine.id)!.quantity).toBe(18);
    expect(store.listIntakes(TODAY)).toHaveLength(1);
  });

  it('pular não mexe no estoque', () => {
    const { medicine, scheduleId } = withSchedule(20, 2);
    store.recordIntake(scheduleId, TODAY, 'skipped', NOW);
    expect(store.getMedicine(medicine.id)!.quantity).toBe(20);
  });

  it('trocar de tomado para pulado devolve a dose', () => {
    const { medicine, scheduleId } = withSchedule(20, 2);
    store.recordIntake(scheduleId, TODAY, 'taken', NOW);
    store.recordIntake(scheduleId, TODAY, 'skipped', NOW);
    expect(store.getMedicine(medicine.id)!.quantity).toBe(20);
  });

  it('desfazer devolve exatamente o que saiu, mesmo com estoque insuficiente', () => {
    const { medicine, scheduleId } = withSchedule(1, 2);
    store.recordIntake(scheduleId, TODAY, 'taken', NOW);
    expect(store.getMedicine(medicine.id)!.quantity).toBe(0);
    store.undoIntake(scheduleId, TODAY);
    expect(store.getMedicine(medicine.id)!.quantity).toBe(1);
    expect(store.listIntakes(TODAY)).toEqual([]);
  });

  it('dias diferentes são doses diferentes', () => {
    const { medicine, scheduleId } = withSchedule(20, 1);
    store.recordIntake(scheduleId, '2026-10-11', 'taken', NOW);
    store.recordIntake(scheduleId, TODAY, 'taken', NOW);
    expect(store.getMedicine(medicine.id)!.quantity).toBe(18);
  });

  it('recusa horário que não existe', () => {
    expect(store.recordIntake(999, TODAY, 'taken', NOW)).toBe(false);
  });
});

describe('ajustes e notificações', () => {
  it('começa com os ajustes padrão e guarda os novos', () => {
    expect(store.getSettings()).toEqual(DEFAULT_SETTINGS);
    store.saveSettings({ expiryWarnDays: 60, alertTime: '07:30' });
    expect(store.getSettings()).toEqual({ expiryWarnDays: 60, alertTime: '07:30' });
  });

  it('inscreve cada aparelho uma vez só', () => {
    const subscription = { endpoint: 'https://push.example/1', p256dh: 'a', auth: 'b' };
    store.saveSubscription(subscription, NOW);
    store.saveSubscription({ ...subscription, auth: 'c' }, NOW);
    expect(store.listSubscriptions()).toEqual([{ ...subscription, auth: 'c' }]);
    store.deleteSubscription(subscription.endpoint);
    expect(store.countSubscriptions()).toBe(0);
  });

  it('cada aviso só pode ser reivindicado uma vez', () => {
    expect(store.claimNotification('dose:1:2026-10-12', NOW)).toBe(true);
    expect(store.claimNotification('dose:1:2026-10-12', NOW)).toBe(false);
    store.pruneNotificationLog('2026-10-13T00:00:00.000Z');
    expect(store.claimNotification('dose:1:2026-10-12', NOW)).toBe(true);
  });
});
