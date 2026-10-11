// Gera o catálogo de remédios (código de barras → dados da caixa) a partir da lista aberta de
// preços de medicamentos da Anvisa (CMED), e reparte em 100 arquivos pequenos em
// public/catalogo/, para o app baixar só o pedaço do código lido.
//
//   npm run catalog                 baixa a lista atual da Anvisa
//   npm run catalog -- lista.csv    usa um arquivo já baixado
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const SOURCE = 'https://dados.anvisa.gov.br/dados/TA_PRECO_MEDICAMENTO.csv';
const OUT = new URL('../public/catalogo/', import.meta.url);

/** CSV com `;` e campos entre aspas (que podem conter `;` e quebras de linha). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ';') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') field += char;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows;
}

function isValidEan13(code) {
  if (!/^\d{13}$/.test(code)) return false;
  const sum = [...code.slice(0, 12)].reduce(
    (total, d, i) => total + Number(d) * (i % 2 ? 3 : 1),
    0,
  );
  return (10 - (sum % 10)) % 10 === Number(code[12]);
}

const clean = (value) => (value ?? '').replace(/\s+/g, ' ').trim();

const file = process.argv[2];
let csv;
if (file) {
  csv = await readFile(file, 'utf8');
} else {
  console.log(`Baixando ${SOURCE}…`);
  const response = await fetch(SOURCE);
  if (!response.ok) throw new Error(`A Anvisa respondeu ${response.status}`);
  csv = await response.text();
}

const [header, ...rows] = parseCsv(csv.replace(/^\uFEFF/, ''));
const columns = header.map(clean);
const column = (prefix) => {
  const index = columns.findIndex((name) => name.startsWith(prefix));
  if (index < 0) throw new Error(`A lista não tem mais a coluna "${prefix}": o formato mudou.`);
  return index;
};
const at = {
  substance: column('SUBSTÂNCIA'),
  laboratory: column('LABORATÓRIO'),
  eans: [column('EAN 1'), column('EAN 2'), column('EAN 3')],
  product: column('PRODUTO'),
  presentation: column('APRESENTAÇÃO'),
  therapeuticClass: column('CLASSE TERAPÊUTICA'),
  // O nome traz o ano ("COMERCIALIZAÇÃO 2025") e muda a cada lista.
  onSale: column('COMERCIALIZAÇÃO'),
};

const shards = new Map();
const onSale = new Set();
let total = 0;
for (const row of rows) {
  const product = clean(row[at.product]);
  if (!product) continue;
  const record = [
    product,
    clean(row[at.presentation]),
    clean(row[at.substance]),
    clean(row[at.therapeuticClass]).split(' - ')[0],
    clean(row[at.laboratory]),
  ];
  const selling = clean(row[at.onSale]) === 'Sim';
  for (const index of at.eans) {
    const ean = clean(row[index]);
    if (!isValidEan13(ean)) continue;
    const key = ean.slice(-2);
    const shard = shards.get(key) ?? shards.set(key, {}).get(key);
    // O mesmo código aparece em mais de uma linha: fica a que está à venda.
    if (shard[ean] && (onSale.has(ean) || !selling)) continue;
    if (!shard[ean]) total += 1;
    shard[ean] = record;
    if (selling) onSale.add(ean);
  }
}

if (total < 10_000) throw new Error(`Só ${total} códigos: a lista parece incompleta.`);

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
for (const [key, shard] of shards) {
  const sorted = Object.fromEntries(Object.entries(shard).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(new URL(`${key}.json`, OUT), JSON.stringify(sorted));
}
await writeFile(
  new URL('info.json', OUT),
  `${JSON.stringify({ source: SOURCE, generatedAt: new Date().toISOString().slice(0, 10), codes: total }, null, 2)}\n`,
);
console.log(`${total} códigos de barras em ${shards.size} arquivos (public/catalogo/).`);
