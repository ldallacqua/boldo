export const UNITS = {
  comprimido: ['comprimido', 'comprimidos'],
  capsula: ['cápsula', 'cápsulas'],
  ml: ['mL', 'mL'],
  gota: ['gota', 'gotas'],
  sache: ['sachê', 'sachês'],
  ampola: ['ampola', 'ampolas'],
  aplicacao: ['aplicação', 'aplicações'],
  unidade: ['unidade', 'unidades'],
} as const;

export type UnitKey = keyof typeof UNITS;

export const UNIT_KEYS = Object.keys(UNITS) as UnitKey[];

/** Dia da semana no padrão do JavaScript: 0 = domingo … 6 = sábado. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const ALL_DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

export interface Schedule {
  id: number;
  medicineId: number;
  /** Horário local no formato HH:MM. */
  time: string;
  days: Weekday[];
  /** Quanto é tomado por vez, na unidade do remédio. */
  dose: number;
}

export interface Medicine {
  id: number;
  name: string;
  /** Número e medida, no formato de `formatDosage`: "500 mg", "20 mg/mL". Vazio se não há. */
  dosage: string;
  /** Pra que serve, em tags: "Dor", "Febre". */
  tags: string[];
  unit: UnitKey;
  quantity: number;
  /** Avisar quando a quantidade for menor ou igual a este valor. 0 desliga o aviso. */
  lowThreshold: number;
  /** Validade no formato AAAA-MM, como vem impresso na caixa. */
  expiresOn: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  schedules: Schedule[];
}

export interface ScheduleInput {
  id?: number;
  time: string;
  days: Weekday[];
  dose: number;
}

export interface MedicineInput {
  name: string;
  dosage: string;
  tags: string[];
  unit: UnitKey;
  quantity: number;
  lowThreshold: number;
  expiresOn: string | null;
  notes: string;
  schedules: ScheduleInput[];
}

export type DoseStatus = 'pending' | 'late' | 'taken' | 'skipped';

export interface DoseToday {
  scheduleId: number;
  medicineId: number;
  medicineName: string;
  dosage: string;
  unit: UnitKey;
  time: string;
  dose: number;
  status: DoseStatus;
  recordedAt: string | null;
}

export interface TodayResponse {
  date: string;
  time: string;
  doses: DoseToday[];
}

export interface Settings {
  /** Com quantos dias de antecedência avisar que um remédio vai vencer. */
  expiryWarnDays: number;
  /** A partir de que horas (HH:MM) os avisos de estoque e validade podem ser enviados. */
  alertTime: string;
}

export interface SettingsResponse extends Settings {
  timezone: string;
  vapidPublicKey: string;
  devices: number;
}

export interface PushPayload {
  title: string;
  body: string;
  tag: string;
  url: string;
  /** Toca de novo mesmo substituindo um aviso com a mesma `tag` (a repetição do lembrete). */
  renotify?: boolean;
  /** Presente nos lembretes de dose, para o botão "Tomei" da notificação. */
  dose?: {
    scheduleId: number;
    date: string;
    /** Autoriza registrar só esta dose, sem precisar da sessão. */
    token: string;
  };
}
