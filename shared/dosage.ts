/** Medidas de dosagem que aparecem nas caixas. A ordem é a da lista do formulário. */
export const DOSAGE_UNITS = ['mg', 'g', 'mcg', 'mL', 'mg/mL', 'mg/g', 'UI', 'UI/mL', '%'] as const;

export type DosageUnit = (typeof DOSAGE_UNITS)[number];

export interface Dosage {
  amount: number;
  unit: DosageUnit;
}

const MAX_AMOUNT = 10_000_000;

const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

/** "500 mg", "2.000 UI", "0,9%". É assim que a dosagem fica guardada. */
export function formatDosage({ amount, unit }: Dosage): string {
  return unit === '%' ? `${number.format(amount)}%` : `${number.format(amount)} ${unit}`;
}

function parseAmount(raw: string): number | null {
  // No Brasil o ponto separa milhares ("2.000 UI") e a vírgula, decimais ("0,9%").
  const thousands = /^[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(raw);
  const normalized = (thousands ? raw.replace(/\./g, '') : raw).replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Math.round(Number(normalized) * 1000) / 1000;
  return value > 0 && value <= MAX_AMOUNT ? value : null;
}

/** Lê o que `formatDosage` escreve e variações comuns ("500mg", "0.5 G"). */
export function parseDosage(text: string): Dosage | null {
  const match = /^(\d[\d.,]*)\s*(\D.*)$/.exec(text.trim());
  if (!match) return null;
  const amount = parseAmount(match[1]!);
  const wanted = match[2]!.trim().toLowerCase();
  const unit = DOSAGE_UNITS.find((candidate) => candidate.toLowerCase() === wanted);
  return amount !== null && unit ? { amount, unit } : null;
}
