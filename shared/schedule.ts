import { minutesOf, type LocalNow } from './time';
import type { DoseStatus, Schedule } from './types';

/** Depois de quantos minutos uma dose não registrada passa a contar como atrasada. */
export const LATE_AFTER_MINUTES = 30;

/** Janela em que o lembrete ainda é enviado se o servidor esteve fora do ar no horário. */
export const REMINDER_GRACE_MINUTES = 60;

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
