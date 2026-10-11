import { formatDosage, parseDosage } from './dosage';
import { normalizeTags } from './tags';
import type { UnitKey } from './types';

/**
 * Catálogo de remédios vendidos no Brasil, tirado da lista aberta de preços da Anvisa (CMED).
 * `scripts/build-catalog.mjs` reparte a lista em arquivos pequenos em `public/catalogo/`;
 * aqui fica a leitura de cada linha: do texto da caixa para os campos do formulário.
 */

/** Uma linha do catálogo, como vem da Anvisa (em maiúsculas). */
export type CatalogRecord = [
  product: string,
  presentation: string,
  substance: string,
  classCode: string,
  laboratory: string,
];

/** Um arquivo do catálogo: código de barras → linha. */
export type CatalogShard = Record<string, CatalogRecord>;

export interface CatalogPrefill {
  name: string;
  /** No formato de `formatDosage`, ou vazio quando a caixa traz mais de uma dosagem. */
  dosage: string;
  unit: UnitKey;
  /** Quanto vem em uma caixa cheia. */
  quantity: number;
  tags: string[];
  notes: string;
}

export interface CatalogMatch {
  ean: string;
  /** Como a Anvisa descreve a caixa, para a pessoa conferir: "LORATADINA 10 MG COM CT BL X 12". */
  label: string;
  laboratory: string;
  prefill: CatalogPrefill;
}

/** Confere o dígito verificador de um código EAN-13. */
export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  const digits = [...code].map(Number);
  const sum = digits.slice(0, 12).reduce((total, digit, i) => total + digit * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === digits[12];
}

/**
 * Limpa um código digitado ou lido pela câmera. Aceita os 13 dígitos do código de barras e o
 * GTIN de 14 dígitos (com um zero na frente) que vem nos códigos quadrados das caixas novas.
 */
export function normalizeEan(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  const code = digits.length === 14 && digits.startsWith('0') ? digits.slice(1) : digits;
  return isValidEan13(code) ? code : null;
}

/**
 * Tira o código do remédio do que a câmera leu: os 13 dígitos do código de barras ou, no
 * código quadrado (GS1 DataMatrix) das caixas novas, o GTIN que vem depois do "01".
 */
export function eanFromScan(raw: string): string | null {
  // Alguns leitores põem na frente o identificador do tipo de código ("]d2").
  const gtin = /^(?:\][A-Za-z]\d)?[^\d]*01(\d{14})/.exec(raw);
  return (gtin && normalizeEan(gtin[1]!)) ?? normalizeEan(raw);
}

/** Em qual dos 100 arquivos do catálogo um código está. */
export function catalogShard(ean: string): string {
  return ean.slice(-2);
}

const LOWERCASE_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'em', 'para']);

/** "LOSARTANA POTÁSSICA" → "Losartana Potássica"; siglas curtas ("SL", "D3") ficam como estão. */
export function titleCase(text: string): string {
  return text
    .trim()
    .split(/\s+/)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && LOWERCASE_WORDS.has(lower)) return lower;
      if (word.length <= 2 || /\d/.test(word)) return word;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

const AMOUNT = String.raw`\d[\d.]*(?:,\d+)?`;
const STRENGTH_UNIT = String.raw`(?:MG\s?/\s?ML|MG\s?/\s?G|UI\s?/\s?ML|MCG|MG|UI|ML|G|%)`;
const STRENGTH = new RegExp(String.raw`^\(?\s*(${AMOUNT})\s?(${STRENGTH_UNIT})(?![A-Z/])`);
/** Tudo o que vem antes da forma farmacêutica: uma ou mais dosagens ("300 MG + 50 MG"). */
const COMPOSITION = new RegExp(
  String.raw`^[(\s]*${AMOUNT}[\d\s.,+()/A-Z%]*?(?=\s+(?:COM|CAP|DRG|SOL|SUS|XPE|ELX|EMU|CREM|POM|GEL|PO|GRAN|PAS|SUP|OVL|ADES|AER|SPR|LOC|EMPL|XAMP|GOM|ESM|FILME|IMPL|ANEL|PÓ|TINT|LIQ|OLE|SAB|EFEV|COL)\b)`,
);

const count = (text: string) => Number(text.replace(/\./g, '').replace(',', '.'));

function parsePackage(form: string): { unit: UnitKey; quantity: number } {
  const last = (pattern: RegExp) => {
    const found = [...form.matchAll(pattern)].at(-1);
    return found ? count(found[1]!) : null;
  };
  // "CT 2 BL AL PLAS X 15" são dois blísteres de 15: 30 comprimidos.
  const containers = last(/\b(?:CT|CX)\s+(\d+)\s+(?:BL|STR|FR|TB)\b/g) ?? 1;
  const perContainer = last(/\bX\s+(\d[\d.]*)(?!\s*(?:ML|G|MG|L|DOSES?)\b|[\d.,])/g);
  const envelopes = last(/\b(\d+)\s+(?:ENV|SACH|SAC)\b/g);

  if (/^(?:COM|DRG|PAS|PAST)\b/.test(form)) {
    return { unit: 'comprimido', quantity: (perContainer ?? 1) * containers };
  }
  if (/^CAP\b/.test(form)) return { unit: 'capsula', quantity: (perContainer ?? 1) * containers };
  // Antes dos sachês: injetáveis costumam trazer um envelope com lenço de álcool.
  if (/\b(?:INJ|AMP|FA)\b/.test(form)) {
    const units = last(/\b(?:CT|CX)\s+(\d+)\s+(?:AMP|FA|SER|CAR|CARP|CAN|FR|FLAC|BOLS)\b/g);
    return { unit: 'ampola', quantity: units ?? 1 };
  }

  // Adesivos vêm um por envelope, mas não são sachês.
  if (/^ADES\b/.test(form)) return { unit: 'unidade', quantity: envelopes ?? perContainer ?? 1 };
  if (/\b(?:ENV|SACH|SAC)\b/.test(form)) return { unit: 'sache', quantity: envelopes ?? 1 };

  const isLiquid = /^(?:XPE|ELX)\b|^(?:PO\s+)?(?:SOL|SUS|EMU)\b/.test(form);
  const isForMouth = !/\b(?:OFT|NAS|SPR|SPRAY|AER|INAL|CAPI?|TOP|DERM|OTO|RET|VAG|BUC)\b/.test(
    form,
  );
  if (isLiquid && isForMouth) {
    const volume = last(new RegExp(String.raw`\bX\s*(${AMOUNT})\s*ML\b`, 'g'));
    if (volume) return { unit: 'ml', quantity: Math.round(volume * containers * 100) / 100 };
  }
  // Pomadas, colírios, sprays e afins: conta-se a embalagem.
  return { unit: 'unidade', quantity: 1 };
}

/** Lê a apresentação da Anvisa: "500 MG COM REV CT BL AL PLAS TRANS X 20". */
export function parsePresentation(presentation: string): {
  dosage: string;
  /** Preenchida quando há mais de uma dosagem e ela não cabe no campo: "300 mg + 50 mg". */
  composition: string;
  unit: UnitKey;
  quantity: number;
} {
  const text = presentation.replace(/\s+/g, ' ').trim().toUpperCase();
  const whole = COMPOSITION.exec(text)?.[0].trim() ?? '';
  const form = text.slice(whole.length).trim();

  const single = STRENGTH.exec(whole);
  const isSingle =
    single !== null &&
    single[0].replace(/[(\s]/g, '').length === whole.replace(/[()\s]/g, '').length;
  const parsed = isSingle ? parseDosage(`${single[1]} ${single[2]!.replace(/\s/g, '')}`) : null;

  return {
    dosage: parsed ? formatDosage(parsed) : '',
    composition: parsed
      ? ''
      : whole
          .toLowerCase()
          .replace(/\bui\b/g, 'UI')
          .replace(/ml\b/g, 'mL'),
    ...parsePackage(form),
  };
}

/**
 * Da classe terapêutica da Anvisa para tags de "pra que serve". Só entram as classes em que a
 * indicação é clara para quem não é da área; nas demais o campo fica para a pessoa preencher.
 */
const CLASS_TAGS: Record<string, readonly string[]> = {
  A2: ['Azia'],
  A3A: ['Cólica'],
  A3D: ['Cólica', 'Dor'],
  A3F: ['Enjoo'],
  A4: ['Enjoo'],
  A6: ['Prisão de ventre'],
  A7: ['Diarreia'],
  A7E: [],
  A10: ['Diabetes'],
  A11: ['Vitamina'],
  B1: ['Anticoagulante'],
  B3A: ['Anemia'],
  C1: ['Coração'],
  C2: ['Pressão alta'],
  C3: ['Pressão alta'],
  C7: ['Pressão alta'],
  C8: ['Pressão alta'],
  C9: ['Pressão alta'],
  C10: ['Colesterol'],
  D1: ['Micose'],
  D2: ['Pele'],
  D3: ['Pele'],
  D5: ['Pele'],
  D6: ['Pele', 'Infecção'],
  D7: ['Pele'],
  D10: ['Acne'],
  D11: ['Pele'],
  G1: ['Infecção'],
  G3A: ['Anticoncepcional'],
  G4C: ['Próstata'],
  H2: ['Inflamação'],
  H3: ['Tireoide'],
  J1: ['Infecção'],
  J2: ['Micose'],
  J5B3: ['Herpes'],
  J5B4: ['Gripe e resfriado'],
  M1: ['Dor', 'Inflamação'],
  M2: ['Dor'],
  M3: ['Dor'],
  M4: ['Gota'],
  M5B: ['Osteoporose'],
  N2A: ['Dor'],
  N2B: ['Dor', 'Febre'],
  N2C: ['Enxaqueca'],
  N5B: ['Sono'],
  N5C: ['Ansiedade'],
  N6A: ['Depressão'],
  N7C: ['Tontura'],
  P1B: ['Vermes'],
  R1A: ['Alergia'],
  R1B: ['Gripe e resfriado'],
  R2: ['Garganta'],
  R3: ['Asma'],
  R5A: ['Gripe e resfriado'],
  R5C: ['Tosse'],
  R5D: ['Tosse'],
  R6: ['Alergia'],
  S1: ['Olhos'],
  S2: ['Ouvido'],
};

/** "N2B2" → ["Dor", "Febre"]. Procura do código mais específico para o mais geral. */
export function tagsForClass(classCode: string): string[] {
  const parts = /^([A-Z]\d+)([A-Z]?)(\d*)$/.exec(classCode.trim().toUpperCase());
  if (!parts) return [];
  const [, group, sub, detail] = parts;
  for (const key of [`${group}${sub}${detail}`, `${group}${sub}`, group!]) {
    const tags = CLASS_TAGS[key];
    if (tags) return normalizeTags(tags);
  }
  return [];
}

const sentenceCase = (text: string) => {
  const lower = text.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

/** Transforma uma linha do catálogo no que o formulário precisa. */
export function toCatalogMatch(ean: string, record: CatalogRecord): CatalogMatch {
  const [product, presentation, substance, classCode, laboratory] = record;
  const parsed = parsePresentation(presentation);
  const name = titleCase(product);
  const substances = substance
    .split(';')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .join(' + ');

  const notes: string[] = [];
  // Em genéricos o nome já é o princípio ativo; repetir não ajuda.
  if (substances && substances !== product.trim().toLowerCase()) {
    notes.push(`Princípio ativo: ${substances}.`);
  }
  if (parsed.composition) notes.push(`Dosagem: ${parsed.composition}.`);

  return {
    ean,
    label: `${product.trim()} ${presentation.replace(/\s+/g, ' ').trim()}`,
    laboratory: sentenceCase(laboratory.trim()),
    prefill: {
      name,
      dosage: parsed.dosage,
      unit: parsed.unit,
      quantity: parsed.quantity,
      tags: tagsForClass(classCode),
      notes: notes.join('\n'),
    },
  };
}
