import { minutesOf, type LocalNow } from './time';
import type { DoseStatus, DoseToday, Schedule } from './types';

/** Depois de quantos minutos uma dose não registrada passa a contar como atrasada. */
export const LATE_AFTER_MINUTES = 30;

/** Janela em que o lembrete ainda é enviado se o servidor esteve fora do ar no horário. */
export const REMINDER_GRACE_MINUTES = 60;

/** Sem registro da dose, o lembrete é repetido uma vez, este tempo depois do primeiro. */
export const REPEAT_AFTER_MINUTES = 30;

/** Depois disto (contado do horário da dose) o lembrete não é mais repetido. */
export const REPEAT_UNTIL_MINUTES = 120;

export function isScheduledOn(schedule: Pick<Schedule, 'days'>, weekday: number): boolean {
  return schedule.days.includes(weekday as Schedule['days'][number]);
}

export function doseStatus(
  scheduledTime: string,
  nowTime: string,
  recorded: 'taken' | 'skipped' | null,
): DoseStatus {
  if (recorded) return recorded;
  return minutesOf(nowTime) - minutesOf(scheduledTime) > LATE_AFTER_MINUTES ? 'late' : 'pending';
}

/** O lembrete deste horário deve sair agora? */
export function isReminderDue(
  schedule: Pick<Schedule, 'time' | 'days'>,
  now: LocalNow,
  graceMinutes = REMINDER_GRACE_MINUTES,
): boolean {
  if (!isScheduledOn(schedule, now.weekday)) return false;
  const elapsed = minutesOf(now.time) - minutesOf(schedule.time);
  return elapsed >= 0 && elapsed <= graceMinutes;
}

/**
 * A dose segue sem registro: é hora de lembrar de novo? `minutesSinceFirst` é quanto tempo
 * faz que o primeiro lembrete saiu.
 */
export function isRepeatDue(
  schedule: Pick<Schedule, 'time' | 'days'>,
  now: LocalNow,
  minutesSinceFirst: number,
): boolean {
  if (!isScheduledOn(schedule, now.weekday)) return false;
  const elapsed = minutesOf(now.time) - minutesOf(schedule.time);
  return (
    minutesSinceFirst >= REPEAT_AFTER_MINUTES && elapsed > 0 && elapsed <= REPEAT_UNTIL_MINUTES
  );
}

export interface DayProgress {
  total: number;
  /** Tomadas ou puladas: as que não pedem mais nada da pessoa. */
  done: number;
  taken: number;
  /** A dose em aberto que vem primeiro: a atrasada mais antiga, ou a próxima do dia. */
  next: Pick<DoseToday, 'scheduleId' | 'time' | 'status'> | null;
  /** Minutos até a hora de `next`; zero se ela já chegou. */
  minutesToNext: number;
}

/** O resumo do dia para a tela Hoje. `doses` vem em ordem de horário. */
export function dayProgress(
  doses: readonly Pick<DoseToday, 'scheduleId' | 'time' | 'status'>[],
  nowTime: string,
): DayProgress {
  const next = doses.find((dose) => dose.status === 'late' || dose.status === 'pending') ?? null;
  return {
    total: doses.length,
    done: doses.filter((dose) => dose.status === 'taken' || dose.status === 'skipped').length,
    taken: doses.filter((dose) => dose.status === 'taken').length,
    next,
    minutesToNext: next ? Math.max(0, minutesOf(next.time) - minutesOf(nowTime)) : 0,
  };
}
