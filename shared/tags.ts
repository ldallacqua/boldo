/** Tags de "pra que serve" oferecidas como sugestão. A pessoa também pode criar as dela. */
export const SUGGESTED_TAGS = [
  'Dor',
  'Febre',
  'Inflamação',
  'Gripe e resfriado',
  'Tosse',
  'Alergia',
  'Azia',
  'Enjoo',
  'Diarreia',
  'Prisão de ventre',
  'Cólica',
  'Pressão alta',
  'Colesterol',
  'Diabetes',
  'Coração',
  'Infecção',
  'Micose',
  'Pele',
  'Olhos',
  'Asma',
  'Ansiedade',
  'Depressão',
  'Sono',
  'Vitamina',
  'Tireoide',
  'Anticoncepcional',
] as const;

export const MAX_TAGS = 8;
export const MAX_TAG_LENGTH = 30;

/** Forma de comparar tags: "Pressão Alta" e "pressao alta" são a mesma. */
export function tagKey(tag: string): string {
  return tag
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const SUGGESTED_BY_KEY = new Map<string, string>(SUGGESTED_TAGS.map((tag) => [tagKey(tag), tag]));

/** Limpa uma tag digitada: sem espaços sobrando, com inicial maiúscula. Vazia se não sobrar nada. */
export function normalizeTag(raw: string): string {
  const clean = raw
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;.]+|[\s,;.]+$/g, '')
    .trim();
  if (!clean) return '';
  return SUGGESTED_BY_KEY.get(tagKey(clean)) ?? clean.charAt(0).toUpperCase() + clean.slice(1);
}

/** Limpa uma lista de tags e tira as repetidas, mantendo a ordem. */
export function normalizeTags(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of raw) {
    const tag = normalizeTag(item);
    const key = tagKey(tag);
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

/** Transforma o texto livre antigo ("Dor e febre", "Azia, refluxo") em tags. */
export function splitPurpose(text: string): string[] {
  if (SUGGESTED_BY_KEY.has(tagKey(text))) return normalizeTags([text]);
  return normalizeTags(text.split(/\s*[,;/]\s*|\s+e\s+/i)).slice(0, MAX_TAGS);
}
