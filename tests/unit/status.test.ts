import { describe, expect, it } from 'vitest';
import {
  dailyUse,
  daysOfSupply,
  daysUntilExpiry,
  expiryDate,
  expiryStatus,
  healthOf,
  isValidExpiry,
  stockStatus,
  toneOf,
} from '../../shared/status';
import type { Medicine } from '../../shared/types';

const medicine = (patch: Partial<Medicine> = {}): Medicine => ({
  id: 1,
  name: 'Dipirona',
  dosage: '500 mg',
  purpose: 'Dor e febre',
  unit: 'comprimido',
  quantity: 20,
  lowThreshold: 5,
  expiresOn: '2027-03',
  notes: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  schedules: [],
  ...patch,
});

describe('stockStatus', () => {
  it('está ok acima do limite', () => {
    expect(stockStatus(6, 5)).toBe('ok');
  });

  it('está acabando quando chega no limite', () => {
    expect(stockStatus(5, 5)).toBe('low');
    expect(stockStatus(1, 5)).toBe('low');
  });

  it('acabou quando zera, mesmo sem limite configurado', () => {
    expect(stockStatus(0, 5)).toBe('out');
    expect(stockStatus(0, 0)).toBe('out');
  });

  it('limite zero desliga o aviso de acabando', () => {
    expect(stockStatus(1, 0)).toBe('ok');
  });
});

describe('validade', () => {
  it('aceita só AAAA-MM', () => {
    expect(isValidExpiry('2027-03')).toBe(true);
    expect(isValidExpiry('2027-13')).toBe(false);
    expect(isValidExpiry('2027-3')).toBe(false);
    expect(isValidExpiry('03/2027')).toBe(false);
    expect(isValidExpiry(null)).toBe(false);
  });

  it('vale até o último dia do mês impresso', () => {
    expect(expiryDate('2027-03')).toBe('2027-03-31');
    expect(expiryDate('2027-04')).toBe('2027-04-30');
    expect(expiryDate('2027-02')).toBe('2027-02-28');
    expect(expiryDate('2028-02')).toBe('2028-02-29');
    expect(expiryDate('2026-12')).toBe('2026-12-31');
  });

  it('conta os dias até vencer', () => {
    expect(daysUntilExpiry('2026-10', '2026-10-11')).toBe(20);
    expect(daysUntilExpiry('2026-10', '2026-10-31')).toBe(0);
    expect(daysUntilExpiry('2026-10', '2026-11-01')).toBe(-1);
    expect(daysUntilExpiry(null, '2026-10-11')).toBeNull();
  });

  it('classifica vencendo e vencido', () => {
    expect(expiryStatus(null, '2026-10-11', 30)).toBe('none');
    expect(expiryStatus('2027-03', '2026-10-11', 30)).toBe('ok');
    expect(expiryStatus('2026-10', '2026-10-11', 30)).toBe('expiring');
    expect(expiryStatus('2026-10', '2026-10-31', 30)).toBe('expiring');
    expect(expiryStatus('2026-09', '2026-10-01', 30)).toBe('expired');
  });

  it('respeita a antecedência configurada', () => {
    expect(expiryStatus('2026-12', '2026-10-11', 30)).toBe('ok');
    expect(expiryStatus('2026-12', '2026-10-11', 90)).toBe('expiring');
  });
});

describe('toneOf', () => {
  it('o pior problema define a cor da tarja', () => {
    expect(toneOf('ok', 'ok')).toBe('ok');
    expect(toneOf('ok', 'none')).toBe('ok');
    expect(toneOf('low', 'ok')).toBe('warn');
    expect(toneOf('ok', 'expiring')).toBe('warn');
    expect(toneOf('low', 'expired')).toBe('danger');
    expect(toneOf('out', 'ok')).toBe('danger');
  });
});

describe('duração do estoque', () => {
  it('soma o consumo diário dos horários', () => {
    expect(dailyUse([])).toBe(0);
    expect(
      dailyUse([
        { dose: 1, days: [0, 1, 2, 3, 4, 5, 6] },
        { dose: 1, days: [0, 1, 2, 3, 4, 5, 6] },
      ]),
    ).toBe(2);
    expect(dailyUse([{ dose: 7, days: [1] }])).toBe(1);
  });

  it('diz para quantos dias dá', () => {
    const twiceADay = [
      { id: 1, medicineId: 1, time: '08:00', dose: 1, days: [0, 1, 2, 3, 4, 5, 6] },
      { id: 2, medicineId: 1, time: '20:00', dose: 1, days: [0, 1, 2, 3, 4, 5, 6] },
    ] satisfies Medicine['schedules'];
    expect(daysOfSupply({ quantity: 28, schedules: twiceADay })).toBe(14);
    expect(daysOfSupply({ quantity: 3, schedules: twiceADay })).toBe(1);
    expect(daysOfSupply({ quantity: 28, schedules: [] })).toBeNull();
  });
});

describe('healthOf', () => {
  it('junta estoque, validade e tarja', () => {
    const health = healthOf(medicine({ quantity: 4, expiresOn: '2026-10' }), '2026-10-11', 30);
    expect(health).toEqual({
      stock: 'low',
      expiry: 'expiring',
      tone: 'warn',
      daysUntilExpiry: 20,
      daysOfSupply: null,
    });
  });

  it('remédio sem validade e com estoque fica ok', () => {
    expect(healthOf(medicine({ expiresOn: null }), '2026-10-11', 30).tone).toBe('ok');
  });
});
