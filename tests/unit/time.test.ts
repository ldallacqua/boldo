import { describe, expect, it } from 'vitest';
import { doseStatus, isReminderDue, isScheduledOn } from '../../shared/schedule';
import { daysBetween, isValidTime, localNow, minutesOf } from '../../shared/time';

describe('localNow', () => {
  it('converte o instante para o fuso pedido', () => {
    // 02:30 UTC de segunda ainda é domingo à noite em São Paulo (UTC-3).
    const instant = new Date('2026-10-12T02:30:00Z');
    expect(localNow('America/Sao_Paulo', instant)).toEqual({
      date: '2026-10-11',
      time: '23:30',
      weekday: 0,
    });
    expect(localNow('UTC', instant)).toEqual({ date: '2026-10-12', time: '02:30', weekday: 1 });
  });

  it('usa 00 para meia-noite, não 24', () => {
    expect(localNow('UTC', new Date('2026-10-12T00:05:00Z')).time).toBe('00:05');
  });
});

describe('horários', () => {
  it('valida HH:MM', () => {
    expect(isValidTime('08:00')).toBe(true);
    expect(isValidTime('23:59')).toBe(true);
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidTime('8:00')).toBe(false);
    expect(isValidTime('08:60')).toBe(false);
    expect(isValidTime(800)).toBe(false);
  });

  it('converte para minutos do dia', () => {
    expect(minutesOf('00:00')).toBe(0);
    expect(minutesOf('08:30')).toBe(510);
    expect(minutesOf('23:59')).toBe(1439);
  });

  it('conta dias entre datas, atravessando mês e ano', () => {
    expect(daysBetween('2026-10-11', '2026-10-11')).toBe(0);
    expect(daysBetween('2026-10-11', '2026-11-01')).toBe(21);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2026-10-11', '2026-10-01')).toBe(-10);
  });
});

describe('doses', () => {
  it('sabe em que dias o horário vale', () => {
    expect(isScheduledOn({ days: [1, 2, 3, 4, 5] }, 1)).toBe(true);
    expect(isScheduledOn({ days: [1, 2, 3, 4, 5] }, 0)).toBe(false);
  });

  it('o registro manda no estado da dose', () => {
    expect(doseStatus('08:00', '23:00', 'taken')).toBe('taken');
    expect(doseStatus('08:00', '23:00', 'skipped')).toBe('skipped');
  });

  it('sem registro, fica pendente e depois atrasada', () => {
    expect(doseStatus('08:00', '07:00', null)).toBe('pending');
    expect(doseStatus('08:00', '08:30', null)).toBe('pending');
    expect(doseStatus('08:00', '08:31', null)).toBe('late');
  });
});

describe('isReminderDue', () => {
  const schedule = { time: '08:00', days: [1, 2, 3, 4, 5] as (0 | 1 | 2 | 3 | 4 | 5 | 6)[] };
  const at = (time: string, weekday: 0 | 1 = 1) => ({ date: '2026-10-12', time, weekday });

  it('não dispara antes da hora', () => {
    expect(isReminderDue(schedule, at('07:59'))).toBe(false);
  });

  it('dispara na hora e dentro da tolerância', () => {
    expect(isReminderDue(schedule, at('08:00'))).toBe(true);
    expect(isReminderDue(schedule, at('09:00'))).toBe(true);
  });

  it('não dispara depois da tolerância', () => {
    expect(isReminderDue(schedule, at('09:01'))).toBe(false);
  });

  it('não dispara em dia fora da agenda', () => {
    expect(isReminderDue(schedule, at('08:00', 0))).toBe(false);
  });
});
