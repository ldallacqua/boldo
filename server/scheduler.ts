import { formatDays, formatExpiry, formatQuantity } from '../shared/format';
import { isReminderDue } from '../shared/schedule';
import { healthOf } from '../shared/status';
import { localNow } from '../shared/time';
import type { Medicine, PushPayload } from '../shared/types';
import type { PushSender } from './push';
import type { Store } from './store';

/** Avisos de estoque e validade não saem depois deste horário, para não acordar ninguém. */
const ALERTS_END = '21:00';

const LOG_RETENTION_MS = 7 * 86_400_000;

function doseReminder(medicine: Medicine, scheduleId: number, date: string): PushPayload {
  const schedule = medicine.schedules.find((s) => s.id === scheduleId)!;
  const detail = medicine.dosage ? ` (${medicine.dosage})` : '';
  return {
    title: `Hora de tomar ${medicine.name}`,
    body: `${formatQuantity(schedule.dose, medicine.unit)}${detail} às ${schedule.time}`,
    tag: `dose-${scheduleId}-${date}`,
    url: '/',
    dose: { scheduleId, date },
  };
}

function stockAlert(medicine: Medicine, stage: number): PushPayload {
  const url = `/remedios/${medicine.id}`;
  if (stage === 2) {
    return {
      title: `${medicine.name} acabou`,
      body: 'O estoque chegou a zero.',
      tag: `stock-${medicine.id}`,
      url,
    };
  }
  const verb = medicine.quantity === 1 ? 'Resta' : 'Restam';
  return {
    title: `${medicine.name} está acabando`,
    body: `${verb} ${formatQuantity(medicine.quantity, medicine.unit)}.`,
    tag: `stock-${medicine.id}`,
    url,
  };
}

function expiryAlert(medicine: Medicine, stage: number, daysLeft: number): PushPayload {
  const url = `/remedios/${medicine.id}`;
  const printed = formatExpiry(medicine.expiresOn!);
  if (stage === 2) {
    return {
      title: `${medicine.name} venceu`,
      body: `Validade: ${printed}. Descarte em um ponto de coleta.`,
      tag: `expiry-${medicine.id}`,
      url,
    };
  }
  return {
    title:
      daysLeft === 0
        ? `${medicine.name} vence hoje`
        : `${medicine.name} vence em ${formatDays(daysLeft)}`,
    body: `Validade: ${printed}.`,
    tag: `expiry-${medicine.id}`,
    url,
  };
}

const STOCK_STAGE = { ok: 0, low: 1, out: 2 } as const;
const EXPIRY_STAGE = { none: 0, ok: 0, expiring: 1, expired: 2 } as const;

/**
 * Uma passada do agendador: envia os lembretes de dose que venceram e os avisos de
 * estoque/validade que ainda não foram dados. Pode rodar quantas vezes for; nada sai repetido.
 */
export async function runTick(
  store: Store,
  sender: PushSender,
  timezone: string,
  instant: Date = new Date(),
): Promise<PushPayload[]> {
  const now = localNow(timezone, instant);
  const nowIso = instant.toISOString();
  const settings = store.getSettings();
  const medicines = store.listMedicines();
  const outbox: PushPayload[] = [];

  const recorded = new Set(store.listIntakes(now.date).map((intake) => intake.schedule_id));
  for (const medicine of medicines) {
    for (const schedule of medicine.schedules) {
      if (!isReminderDue(schedule, now) || recorded.has(schedule.id)) continue;
      if (store.claimNotification(`dose:${schedule.id}:${now.date}`, nowIso)) {
        outbox.push(doseReminder(medicine, schedule.id, now.date));
      }
    }
  }

  const alertsOpen = now.time >= settings.alertTime && now.time < ALERTS_END;
  for (const medicine of medicines) {
    const health = healthOf(medicine, now.date, settings.expiryWarnDays);
    const sent = store.getAlertStages(medicine.id);
    const target = {
      stockStage: STOCK_STAGE[health.stock],
      expiryStage: EXPIRY_STAGE[health.expiry],
    };
    const next = { ...sent };

    // Melhorou (repôs o estoque, corrigiu a validade): rearma o aviso na hora.
    if (target.stockStage < sent.stockStage) next.stockStage = target.stockStage;
    if (target.expiryStage < sent.expiryStage) next.expiryStage = target.expiryStage;

    if (alertsOpen) {
      if (target.stockStage > sent.stockStage) {
        outbox.push(stockAlert(medicine, target.stockStage));
        next.stockStage = target.stockStage;
      }
      if (target.expiryStage > sent.expiryStage) {
        outbox.push(expiryAlert(medicine, target.expiryStage, health.daysUntilExpiry ?? 0));
        next.expiryStage = target.expiryStage;
      }
    }

    if (next.stockStage !== sent.stockStage || next.expiryStage !== sent.expiryStage) {
      store.setAlertStages(medicine.id, next);
    }
  }

  store.pruneNotificationLog(new Date(instant.getTime() - LOG_RETENTION_MS).toISOString());

  for (const payload of outbox) await sender.send(payload);
  return outbox;
}

export function startScheduler(
  store: Store,
  sender: PushSender,
  timezone: string,
  intervalMs = 30_000,
): () => void {
  const tick = () => {
    runTick(store, sender, timezone).catch((error) => console.error('[agendador]', error));
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  return () => clearInterval(timer);
}
