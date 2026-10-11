import { formatDosage, parseDosage } from './dosage';
import { isValidExpiry } from './status';
import { MAX_TAG_LENGTH, MAX_TAGS, normalizeTags, splitPurpose } from './tags';
import { isValidTime } from './time';
import {
  UNIT_KEYS,
  type MedicineInput,
  type ScheduleInput,
  type Settings,
  type UnitKey,
  type Weekday,
} from './types';

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const MAX_QUANTITY = 100_000;

function text(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : null;
}

function amount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0 || value > MAX_QUANTITY) return null;
  return Math.round(value * 100) / 100;
}

function parseSchedule(raw: unknown): ScheduleInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (!isValidTime(s.time)) return null;
  const dose = amount(s.dose);
  if (dose === null || dose <= 0) return null;
  if (!Array.isArray(s.days) || s.days.length === 0) return null;
  if (!s.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return null;
  const days = [...new Set(s.days as Weekday[])].sort();
  const id = Number.isInteger(s.id) ? (s.id as number) : undefined;
  return { id, time: s.time, days, dose };
}

export function parseMedicineInput(raw: unknown): Result<MedicineInput> {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Dados inválidos.' };
  const m = raw as Record<string, unknown>;

  const name = text(m.name, 120);
  if (!name) return { ok: false, error: 'Informe o nome do remédio.' };

  const notes = text(m.notes, 4000);
  if (notes === null) return { ok: false, error: 'As anotações são longas demais.' };

  // `purpose` é o texto livre de antes das tags; um app antigo em cache ainda pode enviá-lo.
  const rawTags = m.tags ?? (typeof m.purpose === 'string' ? splitPurpose(m.purpose) : []);
  if (!Array.isArray(rawTags) || !rawTags.every((tag) => typeof tag === 'string')) {
    return { ok: false, error: 'Em "Pra que serve", as tags precisam ser textos.' };
  }
  const tags = normalizeTags(rawTags);
  if (tags.length > MAX_TAGS || tags.some((tag) => tag.length > MAX_TAG_LENGTH)) {
    return {
      ok: false,
      error: `Em "Pra que serve", use até ${MAX_TAGS} tags de até ${MAX_TAG_LENGTH} letras.`,
    };
  }

  const dosageText = text(m.dosage, 40);
  const parsedDosage = dosageText ? parseDosage(dosageText) : null;
  if (dosageText !== '' && !parsedDosage) {
    return {
      ok: false,
      error: 'Dosagem inválida. Informe um número maior que zero e a medida, como 500 mg.',
    };
  }
  const dosage = parsedDosage ? formatDosage(parsedDosage) : '';

  const unit = (m.unit ?? 'comprimido') as UnitKey;
  if (!UNIT_KEYS.includes(unit)) return { ok: false, error: 'Unidade desconhecida.' };

  const quantity = amount(m.quantity ?? 0);
  if (quantity === null) return { ok: false, error: 'A quantidade precisa ser zero ou mais.' };

  const lowThreshold = amount(m.lowThreshold ?? 0);
  if (lowThreshold === null) {
    return { ok: false, error: 'O aviso de estoque precisa ser zero ou mais.' };
  }

  const expiresOn = m.expiresOn === undefined || m.expiresOn === '' ? null : m.expiresOn;
  if (expiresOn !== null && !isValidExpiry(expiresOn)) {
    return { ok: false, error: 'Validade inválida. Use mês e ano.' };
  }

  const rawSchedules = m.schedules ?? [];
  if (!Array.isArray(rawSchedules) || rawSchedules.length > 24) {
    return { ok: false, error: 'Horários inválidos.' };
  }
  const schedules: ScheduleInput[] = [];
  for (const item of rawSchedules) {
    const schedule = parseSchedule(item);
    if (!schedule) {
      return { ok: false, error: 'Cada horário precisa de hora, dose e ao menos um dia.' };
    }
    schedules.push(schedule);
  }

  return {
    ok: true,
    value: { name, dosage, tags, unit, quantity, lowThreshold, expiresOn, notes, schedules },
  };
}

export function parseSettings(raw: unknown): Result<Settings> {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Dados inválidos.' };
  const s = raw as Record<string, unknown>;
  const days = s.expiryWarnDays;
  if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 365) {
    return { ok: false, error: 'A antecedência precisa ser de 1 a 365 dias.' };
  }
  if (!isValidTime(s.alertTime)) return { ok: false, error: 'Horário inválido.' };
  return { ok: true, value: { expiryWarnDays: days, alertTime: s.alertTime } };
}
