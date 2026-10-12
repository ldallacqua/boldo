import type {
  Medicine,
  MedicineInput,
  Schedule,
  Settings,
  UnitKey,
  Weekday,
} from '../shared/types';
import { splitPurpose } from '../shared/tags';
import type { Db } from './db';

/**
 * Tudo fica no esquema `boldo`, fora do `public`: no Supabase, o que está em `public` é
 * exposto pela API REST automática, e estes dados só podem sair pela nossa API com senha.
 */
const SCHEMA = `
CREATE SCHEMA IF NOT EXISTS boldo;
CREATE TABLE IF NOT EXISTS boldo.medicines (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  dosage text NOT NULL DEFAULT '',
  tags jsonb NOT NULL DEFAULT '[]',
  unit text NOT NULL DEFAULT 'comprimido',
  quantity double precision NOT NULL DEFAULT 0,
  low_threshold double precision NOT NULL DEFAULT 0,
  expires_on text,
  notes text NOT NULL DEFAULT '',
  -- Último estágio já avisado: 0 nada, 1 acabando/vencendo, 2 acabou/venceu.
  stock_stage integer NOT NULL DEFAULT 0,
  expiry_stage integer NOT NULL DEFAULT 0,
  created_at text NOT NULL,
  updated_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS boldo.schedules (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  medicine_id integer NOT NULL REFERENCES boldo.medicines (id) ON DELETE CASCADE,
  time text NOT NULL,
  days text NOT NULL DEFAULT '0123456',
  dose double precision NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS boldo.intakes (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  schedule_id integer REFERENCES boldo.schedules (id) ON DELETE SET NULL,
  medicine_id integer NOT NULL REFERENCES boldo.medicines (id) ON DELETE CASCADE,
  date text NOT NULL,
  time text NOT NULL,
  status text NOT NULL CHECK (status IN ('taken', 'skipped')),
  -- Quanto saiu do estoque de fato, para o "desfazer" devolver o valor certo.
  amount double precision NOT NULL DEFAULT 0,
  recorded_at text NOT NULL,
  UNIQUE (schedule_id, date)
);
CREATE TABLE IF NOT EXISTS boldo.push_subscriptions (
  endpoint text PRIMARY KEY,
  p256dh text NOT NULL,
  auth text NOT NULL,
  -- Remédios (ids) sobre os quais este aparelho não quer ser avisado.
  muted_medicines jsonb NOT NULL DEFAULT '[]',
  created_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS boldo.settings (
  key text PRIMARY KEY,
  value text NOT NULL
);
CREATE TABLE IF NOT EXISTS boldo.notification_log (
  key text PRIMARY KEY,
  sent_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS boldo.login_failures (
  client text PRIMARY KEY,
  count integer NOT NULL,
  reset_at double precision NOT NULL
);
CREATE INDEX IF NOT EXISTS schedules_medicine ON boldo.schedules (medicine_id);
CREATE INDEX IF NOT EXISTS intakes_date ON boldo.intakes (date);
`;

const TABLES = [
  'intakes',
  'schedules',
  'medicines',
  'push_subscriptions',
  'settings',
  'notification_log',
  'login_failures',
];

export const DEFAULT_SETTINGS: Settings = { expiryWarnDays: 30, alertTime: '09:00' };

interface MedicineRow {
  id: number;
  name: string;
  dosage: string;
  /** jsonb: o driver pode entregar já como lista ou ainda como texto. */
  tags: string[] | string;
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

/** Um aparelho inscrito e os remédios que ele silenciou. */
export interface PushDevice extends PushSubscriptionRow {
  mutedMedicines: number[];
}

const toIds = (value: number[] | string): number[] =>
  typeof value === 'string' ? (JSON.parse(value) as number[]) : value;

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
    tags: typeof row.tags === 'string' ? (JSON.parse(row.tags) as string[]) : row.tags,
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

/** Todo o SQL do Boldo passa por aqui. */
export class Store {
  constructor(private readonly db: Db) {}

  /** Cria as tabelas se ainda não existem. Chame uma vez ao subir. */
  async init(): Promise<void> {
    const [found] = await this.db.query<{ ready: string | null }>(
      "SELECT to_regclass('boldo.login_failures')::text AS ready",
    );
    if (!found?.ready) await this.db.exec(SCHEMA);
    await this.migrate();
  }

  /** Atualiza bancos criados por versões anteriores. Cada passo confere se ainda é preciso. */
  private async migrate(): Promise<void> {
    const columns = await this.db.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'boldo' AND table_name IN ('medicines', 'push_subscriptions')`,
    );
    const has = (table: string, column: string) =>
      columns.some((c) => c.table_name === table && c.column_name === column);

    // Cada aparelho passou a poder silenciar remédios.
    if (!has('push_subscriptions', 'muted_medicines')) {
      await this.db.exec(
        `ALTER TABLE boldo.push_subscriptions
           ADD COLUMN IF NOT EXISTS muted_medicines jsonb NOT NULL DEFAULT '[]'`,
      );
    }
    // "Pra que serve" era um texto livre (`purpose`) e virou tags.
    if (has('medicines', 'purpose')) {
      await this.db.transaction(async (tx) => {
        await tx.exec(
          "ALTER TABLE boldo.medicines ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'",
        );
        const rows = await tx.query<{ id: number; purpose: string }>(
          "SELECT id, purpose FROM boldo.medicines WHERE purpose <> ''",
        );
        for (const row of rows) {
          await tx.query('UPDATE boldo.medicines SET tags = $1::jsonb WHERE id = $2', [
            JSON.stringify(splitPurpose(row.purpose)),
            row.id,
          ]);
        }
        await tx.exec('ALTER TABLE boldo.medicines DROP COLUMN purpose');
      });
    }
  }

  /** Uma consulta mínima, para `GET /api/health` dizer se o banco responde. */
  async ping(): Promise<void> {
    await this.db.query('SELECT 1');
  }

  /** Apaga todos os dados. Só para testes. */
  async reset(): Promise<void> {
    const tables = TABLES.map((table) => `boldo.${table}`).join(', ');
    await this.db.exec(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  }

  close(): Promise<void> {
    return this.db.close();
  }

  private transaction<T>(work: (store: Store) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(new Store(tx)));
  }

  // ── Ajustes ────────────────────────────────────────────────────────────

  async getSetting(key: string): Promise<string | null> {
    const [row] = await this.db.query<{ value: string }>(
      'SELECT value FROM boldo.settings WHERE key = $1',
      [key],
    );
    return row?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.db.query(
      `INSERT INTO boldo.settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      [key, value],
    );
  }

  /** Devolve o valor guardado ou, na primeira vez, grava e devolve o que `create` gerar. */
  async getOrCreateSetting(key: string, create: () => string | Promise<string>): Promise<string> {
    const existing = await this.getSetting(key);
    if (existing !== null) return existing;
    // Duas instâncias podem subir ao mesmo tempo: vale o valor de quem gravou primeiro.
    await this.db.query(
      'INSERT INTO boldo.settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
      [key, await create()],
    );
    return (await this.getSetting(key))!;
  }

  async getSettings(): Promise<Settings> {
    const days = Number(await this.getSetting('expiryWarnDays'));
    return {
      expiryWarnDays: Number.isInteger(days) && days > 0 ? days : DEFAULT_SETTINGS.expiryWarnDays,
      alertTime: (await this.getSetting('alertTime')) ?? DEFAULT_SETTINGS.alertTime,
    };
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.setSetting('expiryWarnDays', String(settings.expiryWarnDays));
    await this.setSetting('alertTime', settings.alertTime);
  }

  // ── Remédios ───────────────────────────────────────────────────────────

  async listMedicines(): Promise<Medicine[]> {
    const rows = await this.db.query<MedicineRow>(
      'SELECT * FROM boldo.medicines ORDER BY lower(name), id',
    );
    const schedules = await this.db.query<ScheduleRow>(
      'SELECT * FROM boldo.schedules ORDER BY time, id',
    );
    const byMedicine = new Map<number, Schedule[]>();
    for (const row of schedules) {
      const list = byMedicine.get(row.medicine_id) ?? [];
      list.push(toSchedule(row));
      byMedicine.set(row.medicine_id, list);
    }
    return rows.map((row) => toMedicine(row, byMedicine.get(row.id) ?? []));
  }

  async getMedicine(id: number): Promise<Medicine | null> {
    const [row] = await this.db.query<MedicineRow>('SELECT * FROM boldo.medicines WHERE id = $1', [
      id,
    ]);
    if (!row) return null;
    const schedules = await this.db.query<ScheduleRow>(
      'SELECT * FROM boldo.schedules WHERE medicine_id = $1 ORDER BY time, id',
      [id],
    );
    return toMedicine(row, schedules.map(toSchedule));
  }

  createMedicine(input: MedicineInput, now: string): Promise<Medicine> {
    return this.transaction(async (tx) => {
      const [{ id }] = await tx.db.query<{ id: number }>(
        `INSERT INTO boldo.medicines
           (name, dosage, tags, unit, quantity, low_threshold, expires_on, notes, created_at, updated_at)
         VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $9)
         RETURNING id`,
        [
          input.name,
          input.dosage,
          JSON.stringify(input.tags),
          input.unit,
          input.quantity,
          input.lowThreshold,
          input.expiresOn,
          input.notes,
          now,
        ],
      );
      await tx.syncSchedules(id, input);
      return (await tx.getMedicine(id))!;
    });
  }

  updateMedicine(id: number, input: MedicineInput, now: string): Promise<Medicine | null> {
    return this.transaction(async (tx) => {
      const updated = await tx.db.query(
        `UPDATE boldo.medicines
            SET name = $1, dosage = $2, tags = $3::jsonb, unit = $4, quantity = $5, low_threshold = $6,
                expires_on = $7, notes = $8, updated_at = $9
          WHERE id = $10
          RETURNING id`,
        [
          input.name,
          input.dosage,
          JSON.stringify(input.tags),
          input.unit,
          input.quantity,
          input.lowThreshold,
          input.expiresOn,
          input.notes,
          now,
          id,
        ],
      );
      if (updated.length === 0) return null;
      await tx.syncSchedules(id, input);
      return tx.getMedicine(id);
    });
  }

  /** Mantém o id dos horários que continuam, para não perder o histórico de doses do dia. */
  private async syncSchedules(medicineId: number, input: MedicineInput): Promise<void> {
    const existing = await this.db.query<{ id: number }>(
      'SELECT id FROM boldo.schedules WHERE medicine_id = $1',
      [medicineId],
    );
    const existingIds = new Set(existing.map((row) => row.id));
    const kept = new Set<number>();

    for (const schedule of input.schedules) {
      const days = schedule.days.join('');
      if (schedule.id !== undefined && existingIds.has(schedule.id)) {
        await this.db.query(
          'UPDATE boldo.schedules SET time = $1, days = $2, dose = $3 WHERE id = $4',
          [schedule.time, days, schedule.dose, schedule.id],
        );
        kept.add(schedule.id);
      } else {
        await this.db.query(
          'INSERT INTO boldo.schedules (medicine_id, time, days, dose) VALUES ($1, $2, $3, $4)',
          [medicineId, schedule.time, days, schedule.dose],
        );
      }
    }
    for (const id of existingIds) {
      if (!kept.has(id)) await this.db.query('DELETE FROM boldo.schedules WHERE id = $1', [id]);
    }
  }

  async deleteMedicine(id: number): Promise<boolean> {
    const deleted = await this.db.query('DELETE FROM boldo.medicines WHERE id = $1 RETURNING id', [
      id,
    ]);
    return deleted.length > 0;
  }

  /** Soma `delta` ao estoque, sem deixar ficar negativo. */
  async adjustQuantity(id: number, delta: number, now: string): Promise<Medicine | null> {
    const updated = await this.db.query(
      `UPDATE boldo.medicines
          SET quantity = round(greatest(0, quantity + $1)::numeric, 2)::double precision,
              updated_at = $2
        WHERE id = $3
        RETURNING id`,
      [delta, now, id],
    );
    return updated.length > 0 ? this.getMedicine(id) : null;
  }

  // ── Doses ──────────────────────────────────────────────────────────────

  async getSchedule(id: number): Promise<Schedule | null> {
    const [row] = await this.db.query<ScheduleRow>('SELECT * FROM boldo.schedules WHERE id = $1', [
      id,
    ]);
    return row ? toSchedule(row) : null;
  }

  listIntakes(date: string): Promise<IntakeRow[]> {
    return this.db.query<IntakeRow>('SELECT * FROM boldo.intakes WHERE date = $1', [date]);
  }

  listAllIntakes(): Promise<IntakeRow[]> {
    return this.db.query<IntakeRow>('SELECT * FROM boldo.intakes ORDER BY date, time, id');
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
  ): Promise<boolean> {
    return this.transaction(async (tx) => {
      const schedule = await tx.getSchedule(scheduleId);
      if (!schedule) return false;
      // Trava o remédio: dois toques simultâneos em "Tomei" entram em fila em vez de colidir.
      const [medicine] = await tx.db.query<{ quantity: number }>(
        'SELECT quantity FROM boldo.medicines WHERE id = $1 FOR UPDATE',
        [schedule.medicineId],
      );
      const returned = await tx.removeIntake(scheduleId, date);

      let amount = 0;
      if (status === 'taken') {
        amount = Math.min(schedule.dose, medicine.quantity + returned);
        await tx.adjustQuantity(schedule.medicineId, -amount, now);
      }
      await tx.db.query(
        `INSERT INTO boldo.intakes (schedule_id, medicine_id, date, time, status, amount, recorded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [scheduleId, schedule.medicineId, date, schedule.time, status, amount, now],
      );
      return true;
    });
  }

  /** Apaga o registro e devolve ao estoque o que tinha sido descontado. */
  async undoIntake(scheduleId: number, date: string): Promise<void> {
    await this.transaction((tx) => tx.removeIntake(scheduleId, date));
  }

  /** Devolve quanto voltou para o estoque. */
  private async removeIntake(scheduleId: number, date: string): Promise<number> {
    const [intake] = await this.db.query<IntakeRow>(
      'DELETE FROM boldo.intakes WHERE schedule_id = $1 AND date = $2 RETURNING *',
      [scheduleId, date],
    );
    if (!intake || intake.amount <= 0) return 0;
    await this.adjustQuantity(intake.medicine_id, intake.amount, intake.recorded_at);
    return intake.amount;
  }

  // ── Notificações ───────────────────────────────────────────────────────

  async listSubscriptions(): Promise<PushDevice[]> {
    const rows = await this.db.query<PushSubscriptionRow & { muted_medicines: number[] | string }>(
      'SELECT endpoint, p256dh, auth, muted_medicines FROM boldo.push_subscriptions',
    );
    return rows.map(({ muted_medicines, ...row }) => ({
      ...row,
      mutedMedicines: toIds(muted_medicines),
    }));
  }

  /** Os remédios silenciados em um aparelho, ou `null` se ele não está inscrito. */
  async getMutedMedicines(endpoint: string): Promise<number[] | null> {
    const [row] = await this.db.query<{ muted_medicines: number[] | string }>(
      'SELECT muted_medicines FROM boldo.push_subscriptions WHERE endpoint = $1',
      [endpoint],
    );
    return row ? toIds(row.muted_medicines) : null;
  }

  /** Devolve `false` se o aparelho não está inscrito. */
  async setMutedMedicines(endpoint: string, medicineIds: number[]): Promise<boolean> {
    const updated = await this.db.query(
      `UPDATE boldo.push_subscriptions SET muted_medicines = $1::jsonb
        WHERE endpoint = $2 RETURNING endpoint`,
      [JSON.stringify(medicineIds), endpoint],
    );
    return updated.length > 0;
  }

  async countSubscriptions(): Promise<number> {
    const [row] = await this.db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM boldo.push_subscriptions',
    );
    return row.n;
  }

  async saveSubscription(subscription: PushSubscriptionRow, now: string): Promise<void> {
    await this.db.query(
      `INSERT INTO boldo.push_subscriptions (endpoint, p256dh, auth, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`,
      [subscription.endpoint, subscription.p256dh, subscription.auth, now],
    );
  }

  async deleteSubscription(endpoint: string): Promise<void> {
    await this.db.query('DELETE FROM boldo.push_subscriptions WHERE endpoint = $1', [endpoint]);
  }

  /** Marca um aviso como enviado. Devolve `false` se ele já tinha sido marcado. */
  async claimNotification(key: string, now: string): Promise<boolean> {
    const claimed = await this.db.query(
      `INSERT INTO boldo.notification_log (key, sent_at) VALUES ($1, $2)
       ON CONFLICT (key) DO NOTHING RETURNING key`,
      [key, now],
    );
    return claimed.length > 0;
  }

  /** Quando um aviso foi enviado (ISO), ou `null` se ainda não foi. */
  async notificationSentAt(key: string): Promise<string | null> {
    const [row] = await this.db.query<{ sent_at: string }>(
      'SELECT sent_at FROM boldo.notification_log WHERE key = $1',
      [key],
    );
    return row?.sent_at ?? null;
  }

  async pruneNotificationLog(before: string): Promise<void> {
    await this.db.query('DELETE FROM boldo.notification_log WHERE sent_at < $1', [before]);
  }

  async getAlertStages(medicineId: number): Promise<AlertStages> {
    const [row] = await this.db.query<{ stock_stage: number; expiry_stage: number }>(
      'SELECT stock_stage, expiry_stage FROM boldo.medicines WHERE id = $1',
      [medicineId],
    );
    return { stockStage: row?.stock_stage ?? 0, expiryStage: row?.expiry_stage ?? 0 };
  }

  /**
   * Troca o estágio avisado só se ele ainda for o que o agendador leu. Devolve `false` quando
   * outra passada chegou antes, para o mesmo aviso não sair duas vezes.
   */
  async advanceAlertStages(
    medicineId: number,
    from: AlertStages,
    to: AlertStages,
  ): Promise<boolean> {
    const updated = await this.db.query(
      `UPDATE boldo.medicines SET stock_stage = $1, expiry_stage = $2
        WHERE id = $3 AND stock_stage = $4 AND expiry_stage = $5
        RETURNING id`,
      [to.stockStage, to.expiryStage, medicineId, from.stockStage, from.expiryStage],
    );
    return updated.length > 0;
  }

  // ── Tentativas de senha ────────────────────────────────────────────────

  /** Quantas senhas erradas este cliente deu na janela atual. */
  async loginFailures(client: string, nowMs: number): Promise<number> {
    await this.db.query('DELETE FROM boldo.login_failures WHERE reset_at <= $1', [nowMs]);
    const [row] = await this.db.query<{ count: number }>(
      'SELECT count FROM boldo.login_failures WHERE client = $1',
      [client],
    );
    return row?.count ?? 0;
  }

  async recordLoginFailure(client: string, nowMs: number, windowMs: number): Promise<void> {
    await this.db.query(
      `INSERT INTO boldo.login_failures (client, count, reset_at) VALUES ($1, 1, $2)
       ON CONFLICT (client) DO UPDATE SET count = boldo.login_failures.count + 1`,
      [client, nowMs + windowMs],
    );
  }

  async clearLoginFailures(client: string): Promise<void> {
    await this.db.query('DELETE FROM boldo.login_failures WHERE client = $1', [client]);
  }
}
