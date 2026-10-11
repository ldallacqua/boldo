import type { MedicineHealth } from './status';
import { UNITS, type UnitKey, type Weekday } from './types';

const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

export function formatNumber(value: number): string {
  return number.format(value);
}

export function unitLabel(unit: UnitKey, quantity: number): string {
  const [singular, plural] = UNITS[unit];
  return Math.abs(quantity) === 1 ? singular : plural;
}

/** "12 comprimidos", "1 cápsula", "2,5 mL". */
export function formatQuantity(quantity: number, unit: UnitKey): string {
  return `${formatNumber(quantity)} ${unitLabel(unit, quantity)}`;
}

/** "2027-08" → "08/2027", como na caixa. */
export function formatExpiry(expiresOn: string): string {
  const [year, month] = expiresOn.split('-');
  return `${month}/${year}`;
}

export function formatDays(days: number): string {
  return days === 1 ? '1 dia' : `${days} dias`;
}

const DAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** "todos os dias", "seg a sex", "seg, qua, sex". */
export function formatWeekdays(days: Weekday[]): string {
  const sorted = [...new Set(days)].sort();
  if (sorted.length === 7) return 'todos os dias';
  if (sorted.join('') === '12345') return 'seg a sex';
  if (sorted.join('') === '06') return 'fins de semana';
  return sorted.map((d) => DAY_SHORT[d]).join(', ');
}

/** Frases curtas que explicam por que um remédio precisa de atenção. */
export function attentionReasons(
  health: MedicineHealth,
  quantity: number,
  unit: UnitKey,
  expiresOn: string | null,
): string[] {
  const reasons: string[] = [];
  if (health.stock === 'out') reasons.push('Acabou');
  if (health.stock === 'low') {
    reasons.push(
      `Acabando: ${quantity === 1 ? 'resta' : 'restam'} ${formatQuantity(quantity, unit)}`,
    );
  }
  if (expiresOn && health.daysUntilExpiry !== null) {
    if (health.expiry === 'expired') reasons.push(`Venceu em ${formatExpiry(expiresOn)}`);
    if (health.expiry === 'expiring') {
      reasons.push(
        health.daysUntilExpiry === 0
          ? 'Vence hoje'
          : `Vence em ${formatDays(health.daysUntilExpiry)}`,
      );
    }
  }
  return reasons;
}

/** Quanto falta, em palavras: "agora", "em 35 min", "em 2 h", "em 2 h 10 min". */
export function formatWait(minutes: number): string {
  if (minutes <= 0) return 'agora';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `em ${rest} min`;
  return rest === 0 ? `em ${hours} h` : `em ${hours} h ${rest} min`;
}
