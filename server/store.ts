import { DatabaseSync } from 'node:sqlite';
import type {
  Medicine,
  MedicineInput,
  Schedule,
  Settings,
  UnitKey,
  Weekday,
} from '../shared/types';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS medicines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  dosage TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT 'comprimido',
  quantity REAL NOT NULL DEFAULT 0,
  low_threshold REAL NOT NULL DEFAULT 0,
  expires_on TEXT,
  notes TEXT NOT NULL DEFAULT '',
  -- Último estágio já avisado: 0 nada, 1 acabando/vencendo, 2 acabou/venceu.
  stock_stage INTEGER NOT NULL DEFAULT 0,
  expiry_stage INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  time TEXT NOT NULL,
  days TEXT NOT NULL DEFAULT '0123456',
  dose REAL NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS intakes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER REFERENCES schedules(id) ON DELETE SET NULL,
  medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('taken', 'skipped')),
  -- Quanto saiu do estoque de fato, para o "desfazer" devolver o valor certo.
  amount REAL NOT NULL DEFAULT 0,
  recorded_at TEXT NOT NULL,
  UNIQUE (schedule_id, date)
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notification_log (
  key TEXT PRIMARY KEY,
  sent_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS schedules_medicine ON schedules (medicine_id);
CREATE INDEX IF NOT EXISTS intakes_date ON intakes (date);
`;

export const DEFAULT_SETTINGS: Settings = { expiryWarnDays: 30, alertTime: '09:00' };

interface MedicineRow {
  id: number;
  name: string;
  dosage: string;
  purpose: string;
  unit: string;
  quantity: number;
  low_threshold: number;
  expires_on: string | null;
  notes: string;
  stock_stage: number;
  expiry_stage: number;
  created_at: string;
  updated_at: string;
}

interface ScheduleRow {
  id: number;
  medicine_id: number;
  time: string;
  days: string;
  dose: number;
}

export interface IntakeRow {
  id: number;
  schedule_id: number | null;
  medicine_id: number;
  date: string;
  time: string;
  status: 'taken' | 'skipped';
  amount: number;
  recorded_at: string;
}

export interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface AlertStages {
  stockStage: number;
  expiryStage: number;
}

function toSchedule(row: ScheduleRow): Schedule {
  return {
    id: row.id,
    medicineId: row.medicine_id,
    time: row.time,
    days: [...row.days].map(Number) as Weekday[],
    dose: row.dose,
  };
}

function toMedicine(row: MedicineRow, schedules: Schedule[]): Medicine {
  return {
    id: row.id,
    name: row.name,
    dosage: row.dosage,
    purpose: row.purpose,
    unit: row.unit as UnitKey,
    quantity: row.quantity,
    lowThreshold: row.low_threshold,
    expiresOn: row.expires_on,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    schedules,
  };
}

/** Todo o acesso ao SQLite passa por aqui. */
export class Store {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  // ── Ajustes ────────────────────────────────────────────────────────────

  getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      { value: string } | undefined;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      )
      .run(key, value);
  }

  getSettings(): Settings {
    const days = Number(this.getSetting('expiryWarnDays'));
    return {
      expiryWarnDays: Number.isInteger(days) && days > 0 ? days : DEFAULT_SETTINGS.expiryWarnDays,
      alertTime: this.getSetting('alertTime') ?? DEFAULT_SETTINGS.alertTime,
    };
  }

  saveSettings(settings: Settings): void {
    this.setSetting('expiryWarnDays', String(settings.expiryWarnDays));
    this.setSetting('alertTime', settings.alertTime);
  }

  // ── Remédios ───────────────────────────────────────────────────────────

  private schedulesByMedicine(): Map<number, Schedule[]> {
    const rows = this.db
      .prepare('SELECT * FROM schedules ORDER BY time, id')
      .all() as unknown as ScheduleRow[];
    const map = new Map<number, Schedule[]>();
    for (const row of rows) {
      const list = map.get(row.medicine_id) ?? [];
      list.push(toSchedule(row));
      map.set(row.medicine_id, list);
    }
    return map;
  }

  listMedicines(): Medicine[] {
    const rows = this.db
      .prepare('SELECT * FROM medicines ORDER BY name COLLATE NOCASE, id')
      .all() as unknown as MedicineRow[];
    const schedules = this.schedulesByMedicine();
    return rows.map((row) => toMedicine(row, schedules.get(row.id) ?? []));
  }

  getMedicine(id: number): Medicine | null {
    const row = this.db.prepare('SELECT * FROM medicines WHERE id = ?').get(id) as
      MedicineRow | undefined;
    if (!row) return null;
    const schedules = this.db
      .prepare('SELECT * FROM schedules WHERE medicine_id = ? ORDER BY time, id')
      .all(id) as unknown as ScheduleRow[];
    return toMedicine(row, schedules.map(toSchedule));
  }

  createMedicine(input: MedicineInput, now: string): Medicine {
    const id = this.transaction(() => {
      const result = this.db
        .prepare(
          `INSERT INTO medicines
             (name, dosage, purpose, unit, quantity, low_threshold, expires_on, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.name,
          input.dosage,
          input.purpose,
          input.unit,
          input.quantity,
          input.lowThreshold,
          input.expiresOn,
          input.notes,
          now,
          now,
        );
      const medicineId = Number(result.lastInsertRowid);
      this.syncSchedules(medicineId, input);
      return medicineId;
    });
    return this.getMedicine(id)!;
  }

  updateMedicine(id: number, input: MedicineInput, now: string): Medicine | null {
    const found = this.transaction(() => {
      const result = this.db
        .prepare(
          `UPDATE medicines
              SET name = ?, dosage = ?, purpose = ?, unit = ?, quantity = ?, low_threshold = ?,
                  expires_on = ?, notes = ?, updated_at = ?
            WHERE id = ?`,
        )
        .run(
          input.name,
          input.dosage,
          input.purpose,
          input.unit,
          input.quantity,
          input.lowThreshold,
          input.expiresOn,
          input.notes,
          now,
          id,
        );
      if (result.changes === 0) return false;
      this.syncSchedules(id, input);
      return true;
    });
    return found ? this.getMedicine(id) : null;
  }

  /** Mantém o id dos horários que continuam, para não perder o histórico de doses do dia. */
  private syncSchedules(medicineId: number, input: MedicineInput): void {
    const existing = this.db
      .prepare('SELECT id FROM schedules WHERE medicine_id = ?')
      .all(medicineId) as unknown as { id: number }[];
    const existingIds = new Set(existing.map((row) => row.id));
    const kept = new Set<number>();

    for (const schedule of input.schedules) {
      const days = schedule.days.join('');
      if (schedule.id !== undefined && existingIds.has(schedule.id)) {
        this.db
          .prepare('UPDATE schedules SET time = ?, days = ?, dose = ? WHERE id = ?')
          .run(schedule.time, days, schedule.dose, schedule.id);
        kept.add(schedule.id);
      } else {
        this.db
          .prepare('INSERT INTO schedules (medicine_id, time, days, dose) VALUES (?, ?, ?, ?)')
          .run(medicineId, schedule.time, days, schedule.dose);
      }
    }
    for (const id of existingIds) {
      if (!kept.has(id)) this.db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
    }
  }

  deleteMedicine(id: number): boolean {
    return this.db.prepare('DELETE FROM medicines WHERE id = ?').run(id).changes > 0;
  }

  /** Soma `delta` ao estoque, sem deixar ficar negativo. */
  adjustQuantity(id: number, delta: number, now: string): Medicine | null {
    const result = this.db
      .prepare(
        'UPDATE medicines SET quantity = ROUND(MAX(0, quantity + ?), 2), updated_at = ? WHERE id = ?',
      )
      .run(delta, now, id);
    return result.changes > 0 ? this.getMedicine(id) : null;
  }

  // ── Doses ──────────────────────────────────────────────────────────────

  getSchedule(id: number): Schedule | null {
    const row = this.db.prepare('SELECT * FROM schedules WHERE id = ?').get(id) as
      ScheduleRow | undefined;
    return row ? toSchedule(row) : null;
  }

  listIntakes(date: string): IntakeRow[] {
    return this.db
      .prepare('SELECT * FROM intakes WHERE date = ?')
      .all(date) as unknown as IntakeRow[];
  }

  listAllIntakes(): IntakeRow[] {
    return this.db
      .prepare('SELECT * FROM intakes ORDER BY date, time')
      .all() as unknown as IntakeRow[];
  }

  /**
   * Registra a dose de um horário em um dia. Ao tomar, desconta do estoque.
   * Devolve `false` se o horário não existe; repetir o mesmo registro não desconta de novo.
   */
  recordIntake(
    scheduleId: number,
    date: string,
    status: 'taken' | 'skipped',
    now: string,
  ): boolean {
    return this.transaction(() => {
      const schedule = this.getSchedule(scheduleId);
      if (!schedule) return false;
      this.removeIntake(scheduleId, date);

      let amount = 0;
      if (status === 'taken') {
        const medicine = this.getMedicine(schedule.medicineId)!;
        amount = Math.min(schedule.dose, medicine.quantity);
        this.adjustQuantity(medicine.id, -amount, now);
      }
      this.db
        .prepare(
          `INSERT INTO intakes (schedule_id, medicine_id, date, time, status, amount, recorded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(scheduleId, schedule.medicineId, date, schedule.time, status, amount, now);
      return true;
    });
  }

  /** Apaga o registro e devolve ao estoque o que tinha sido descontado. */
  undoIntake(scheduleId: number, date: string): void {
    this.transaction(() => this.removeIntake(scheduleId, date));
  }

  private removeIntake(scheduleId: number, date: string): void {
    const intake = this.db
      .prepare('SELECT * FROM intakes WHERE schedule_id = ? AND date = ?')
      .get(scheduleId, date) as IntakeRow | undefined;
    if (!intake) return;
    if (intake.amount > 0) {
      this.adjustQuantity(intake.medicine_id, intake.amount, intake.recorded_at);
    }
    this.db.prepare('DELETE FROM intakes WHERE id = ?').run(intake.id);
  }

  // ── Notificações ───────────────────────────────────────────────────────

  listSubscriptions(): PushSubscriptionRow[] {
    return this.db
      .prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions')
      .all() as unknown as PushSubscriptionRow[];
  }

  countSubscriptions(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get() as {
      n: number;
    };
    return row.n;
  }

  saveSubscription(subscription: PushSubscriptionRow, now: string): void {
    this.db
      .prepare(
        `INSERT INTO push_subscriptions (endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`,
      )
      .run(subscription.endpoint, subscription.p256dh, subscription.auth, now);
  }

  deleteSubscription(endpoint: string): void {
    this.db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
  }

  /** Marca um aviso como enviado. Devolve `false` se ele já tinha sido marcado. */
  claimNotification(key: string, now: string): boolean {
    const result = this.db
      .prepare('INSERT OR IGNORE INTO notification_log (key, sent_at) VALUES (?, ?)')
      .run(key, now);
    return result.changes > 0;
  }

  pruneNotificationLog(before: string): void {
    this.db.prepare('DELETE FROM notification_log WHERE sent_at < ?').run(before);
  }

  getAlertStages(medicineId: number): AlertStages {
    const row = this.db
      .prepare('SELECT stock_stage, expiry_stage FROM medicines WHERE id = ?')
      .get(medicineId) as { stock_stage: number; expiry_stage: number } | undefined;
    return { stockStage: row?.stock_stage ?? 0, expiryStage: row?.expiry_stage ?? 0 };
  }

  setAlertStages(medicineId: number, stages: AlertStages): void {
    this.db
      .prepare('UPDATE medicines SET stock_stage = ?, expiry_stage = ? WHERE id = ?')
      .run(stages.stockStage, stages.expiryStage, medicineId);
  }
}
