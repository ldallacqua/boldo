import { daysBetween } from './time';
import type { Medicine, Schedule } from './types';

export type StockStatus = 'ok' | 'low' | 'out';
export type ExpiryStatus = 'none' | 'ok' | 'expiring' | 'expired';
/** Cor da tarja: resume o pior problema do remédio. */
export type Tone = 'ok' | 'warn' | 'danger';

export function stockStatus(quantity: number, lowThreshold: number): StockStatus {
  if (quantity <= 0) return 'out';
  if (lowThreshold > 0 && quantity <= lowThreshold) return 'low';
  return 'ok';
}

export function isValidExpiry(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** A validade impressa (AAAA-MM) vale até o último dia daquele mês. */
export function expiryDate(expiresOn: string): string {
  const [year, month] = expiresOn.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${expiresOn}-${String(lastDay).padStart(2, '0')}`;
}

/** Dias até vencer; negativo quando já venceu. `null` se não há validade. */
export function daysUntilExpiry(expiresOn: string | null, today: string): number | null {
  if (!expiresOn) return null;
  return daysBetween(today, expiryDate(expiresOn));
}

export function expiryStatus(
  expiresOn: string | null,
  today: string,
  warnDays: number,
): ExpiryStatus {
  const days = daysUntilExpiry(expiresOn, today);
  if (days === null) return 'none';
  if (days < 0) return 'expired';
  if (days <= warnDays) return 'expiring';
  return 'ok';
}

export function toneOf(stock: StockStatus, expiry: ExpiryStatus): Tone {
  if (stock === 'out' || expiry === 'expired') return 'danger';
  if (stock === 'low' || expiry === 'expiring') return 'warn';
  return 'ok';
}

/** Consumo médio por dia, considerando os dias da semana de cada horário. */
export function dailyUse(schedules: Pick<Schedule, 'dose' | 'days'>[]): number {
  return schedules.reduce((sum, s) => sum + (s.dose * s.days.length) / 7, 0);
}

/** Para quantos dias o estoque dá, no ritmo dos horários cadastrados. */
export function daysOfSupply(medicine: Pick<Medicine, 'quantity' | 'schedules'>): number | null {
  const use = dailyUse(medicine.schedules);
  if (use <= 0) return null;
  return Math.floor(medicine.quantity / use);
}

export interface MedicineHealth {
  stock: StockStatus;
  expiry: ExpiryStatus;
  tone: Tone;
  daysUntilExpiry: number | null;
  daysOfSupply: number | null;
}

export function healthOf(medicine: Medicine, today: string, warnDays: number): MedicineHealth {
  const stock = stockStatus(medicine.quantity, medicine.lowThreshold);
  const expiry = expiryStatus(medicine.expiresOn, today, warnDays);
  return {
    stock,
    expiry,
    tone: toneOf(stock, expiry),
    daysUntilExpiry: daysUntilExpiry(medicine.expiresOn, today),
    daysOfSupply: daysOfSupply(medicine),
  };
}
