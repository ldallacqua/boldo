import { describe, expect, it } from 'vitest';
import { formatWait } from '../../shared/format';
import { dayProgress } from '../../shared/schedule';
import {
  attentionReasons,
  formatDays,
  formatExpiry,
  formatQuantity,
  formatWeekdays,
  unitLabel,
} from '../../shared/format';
import type { MedicineHealth } from '../../shared/status';

describe('quantidades', () => {
  it('concorda singular e plural', () => {
    expect(formatQuantity(1, 'comprimido')).toBe('1 comprimido');
    expect(formatQuantity(12, 'comprimido')).toBe('12 comprimidos');
    expect(formatQuantity(0, 'capsula')).toBe('0 cápsulas');
    expect(formatQuantity(1, 'aplicacao')).toBe('1 aplicação');
    expect(unitLabel('sache', 2)).toBe('sachês');
  });

  it('usa vírgula decimal', () => {
    expect(formatQuantity(2.5, 'ml')).toBe('2,5 mL');
    expect(formatQuantity(0.5, 'comprimido')).toBe('0,5 comprimidos');
  });
});

describe('datas e dias', () => {
  it('mostra a validade como na caixa', () => {
    expect(formatExpiry('2027-08')).toBe('08/2027');
  });

  it('conta dias com plural', () => {
    expect(formatDays(1)).toBe('1 dia');
    expect(formatDays(20)).toBe('20 dias');
  });

  it('resume os dias da semana', () => {
    expect(formatWeekdays([0, 1, 2, 3, 4, 5, 6])).toBe('todos os dias');
    expect(formatWeekdays([5, 4, 3, 2, 1])).toBe('seg a sex');
    expect(formatWeekdays([0, 6])).toBe('fins de semana');
    expect(formatWeekdays([1, 3, 5])).toBe('seg, qua, sex');
  });
});

describe('attentionReasons', () => {
  const health = (patch: Partial<MedicineHealth>): MedicineHealth => ({
    stock: 'ok',
    expiry: 'ok',
    tone: 'ok',
    daysUntilExpiry: 200,
    daysOfSupply: null,
    ...patch,
  });

  it('não diz nada quando está tudo certo', () => {
    expect(attentionReasons(health({}), 20, 'comprimido', '2027-08')).toEqual([]);
  });

  it('explica estoque baixo e zerado', () => {
    expect(attentionReasons(health({ stock: 'low' }), 4, 'comprimido', null)).toEqual([
      'Acabando: restam 4 comprimidos',
    ]);
    expect(attentionReasons(health({ stock: 'low' }), 1, 'capsula', null)).toEqual([
      'Acabando: resta 1 cápsula',
    ]);
    expect(attentionReasons(health({ stock: 'out' }), 0, 'ampola', null)).toEqual(['Acabou']);
  });

  it('explica a validade', () => {
    expect(
      attentionReasons(health({ expiry: 'expiring', daysUntilExpiry: 20 }), 9, 'ml', '2026-10'),
    ).toEqual(['Vence em 20 dias']);
    expect(
      attentionReasons(health({ expiry: 'expiring', daysUntilExpiry: 0 }), 9, 'ml', '2026-10'),
    ).toEqual(['Vence hoje']);
    expect(
      attentionReasons(health({ expiry: 'expired', daysUntilExpiry: -40 }), 9, 'ml', '2026-08'),
    ).toEqual(['Venceu em 08/2026']);
  });

  it('lista os dois problemas quando há dois', () => {
    expect(
      attentionReasons(
        health({ stock: 'low', expiry: 'expired', daysUntilExpiry: -3 }),
        2,
        'comprimido',
        '2026-09',
      ),
    ).toEqual(['Acabando: restam 2 comprimidos', 'Venceu em 09/2026']);
  });
});

describe('formatWait', () => {
  it('diz quanto falta em minutos e horas', () => {
    expect(formatWait(0)).toBe('agora');
    expect(formatWait(-5)).toBe('agora');
    expect(formatWait(35)).toBe('em 35 min');
    expect(formatWait(120)).toBe('em 2 h');
    expect(formatWait(130)).toBe('em 2 h 10 min');
  });
});

describe('dayProgress', () => {
  const dose = (
    scheduleId: number,
    time: string,
    status: 'pending' | 'late' | 'taken' | 'skipped',
  ) => ({
    scheduleId,
    time,
    status,
  });

  it('conta as registradas e aponta a próxima em aberto', () => {
    const progress = dayProgress(
      [dose(1, '08:00', 'taken'), dose(2, '12:30', 'skipped'), dose(3, '20:00', 'pending')],
      '17:45',
    );
    expect(progress).toMatchObject({ total: 3, done: 2, taken: 1, minutesToNext: 135 });
    expect(progress.next?.scheduleId).toBe(3);
  });

  it('a atrasada mais antiga vem antes da próxima do dia, e não tem espera', () => {
    const progress = dayProgress([dose(1, '08:00', 'late'), dose(2, '20:00', 'pending')], '10:00');
    expect(progress.next?.scheduleId).toBe(1);
    expect(progress.minutesToNext).toBe(0);
  });

  it('sem doses em aberto não há próxima', () => {
    expect(dayProgress([dose(1, '08:00', 'taken')], '09:00')).toMatchObject({
      total: 1,
      done: 1,
      next: null,
    });
    expect(dayProgress([], '09:00')).toMatchObject({ total: 0, done: 0, next: null });
  });
});
