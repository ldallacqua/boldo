import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  catalogShard,
  eanFromScan,
  isValidEan13,
  normalizeEan,
  parsePresentation,
  tagsForClass,
  titleCase,
  toCatalogMatch,
  type CatalogShard,
} from '../../shared/catalog';
import { parseDosage } from '../../shared/dosage';
import { parseMedicineInput } from '../../shared/validate';

describe('código de barras', () => {
  it('confere o dígito verificador', () => {
    expect(isValidEan13('7896004712673')).toBe(true);
    expect(isValidEan13('7896004712674')).toBe(false);
    expect(isValidEan13('789600471267')).toBe(false);
    expect(isValidEan13('78960047126ab')).toBe(false);
  });

  it('limpa o que foi digitado e aceita o GTIN de 14 dígitos', () => {
    expect(normalizeEan(' 7896004 712673 ')).toBe('7896004712673');
    expect(normalizeEan('789.600.471.267-3')).toBe('7896004712673');
    expect(normalizeEan('07896004712673')).toBe('7896004712673');
    expect(normalizeEan('17896004712673')).toBeNull();
    expect(normalizeEan('123')).toBeNull();
    expect(normalizeEan('')).toBeNull();
  });

  it('tira o código do que a câmera leu, inclusive do código quadrado da caixa', () => {
    expect(eanFromScan('7896004712673')).toBe('7896004712673');
    expect(eanFromScan('010789600471267317270930102B4X\u001d21123456')).toBe('7896004712673');
    expect(eanFromScan(']d2010789600471267310LOTE')).toBe('7896004712673');
    expect(eanFromScan('https://exemplo.com/qr')).toBeNull();
  });

  it('acha o arquivo do catálogo pelos dois últimos dígitos', () => {
    expect(catalogShard('7896004712673')).toBe('73');
  });
});

describe('titleCase', () => {
  it('escreve nomes da lista como na caixa', () => {
    expect(titleCase('LOSARTANA POTÁSSICA')).toBe('Losartana Potássica');
    expect(titleCase('  ÁCIDO ACETILSALICÍLICO DE SODIO ')).toBe('Ácido Acetilsalicílico de Sodio');
    expect(titleCase('PATZ SL')).toBe('Patz SL');
    expect(titleCase('VITAMINA D3')).toBe('Vitamina D3');
  });
});

describe('parsePresentation', () => {
  const cases: [string, string, string, number][] = [
    ['500 MG COM REV CT BL AL PLAS TRANS X 20', '500 mg', 'comprimido', 20],
    ['16MG COM CT BL AL AL X 30', '16 mg', 'comprimido', 30],
    ['0,25 MG COM CT 2 BL AL PLAS TRANS X 15', '0,25 mg', 'comprimido', 30],
    ['500 MG  + 30 MG COM REV BL AL PLAS TRANS X 200 (EMB MULT)', '', 'comprimido', 200],
    ['300 MG CAP GEL DURA CT BL AL PLAS TRANS  X 16', '300 mg', 'capsula', 16],
    ['2.000 UI CAP MOLE CT FR PLAS OPC X 30', '2.000 UI', 'capsula', 30],
    ['3 MG/ML XPE CT FR VD AMB X 120 ML + COP', '3 mg/mL', 'ml', 120],
    ['500 MG/ML SOL GOT OR CT FR GOT VD AMB X 20 ML', '500 mg/mL', 'ml', 20],
    ['100 MG/ML SOL OR CT FR VD AMB X 50 ML + 2 SER DOS', '100 mg/mL', 'ml', 50],
    ['50 MG/ML PO SUS OR CT FR VD AMB X 60 ML + COP', '50 mg/mL', 'ml', 60],
    ['0,1 MG/ML SOL OFT CT FR GOT PLAS PEBD OPC X 5 ML', '0,1 mg/mL', 'unidade', 1],
    ['10 MG/G CREM DERM CT BG AL X 40 G', '10 mg/g', 'unidade', 1],
    [
      '60 MG SOL INJ SC/IV CT 10 SER PREENC VD TRANS X 0,6 ML + ENV LEN ALCOOL',
      '60 mg',
      'ampola',
      10,
    ],
    ['20 MG/ML SOL INJ IV/IM CX 100 AMP VD TRANS X 5 ML', '20 mg/mL', 'ampola', 100],
    ['120 MG/G GRAN SOL OR CT 16 ENV AL/PAP X 5 G', '120 mg/g', 'sache', 16],
    ['5 MCG/H ADES TRANSD CT 4 ENV PET', '', 'unidade', 4],
    ['SUS OR CT SER PREENC VD TRANS X 1,5 ML', '', 'ml', 1.5],
  ];

  it.each(cases)('%s', (presentation, dosage, unit, quantity) => {
    expect(parsePresentation(presentation)).toMatchObject({ dosage, unit, quantity });
  });

  it('guarda a composição quando a caixa traz mais de uma dosagem', () => {
    expect(parsePresentation('300 MG + 50 MG + 35 MG COM CT BL AL PLAS AMB X 30')).toMatchObject({
      dosage: '',
      composition: '300 mg + 50 mg + 35 mg',
    });
    expect(parsePresentation('550 MCG/ML SUS NAS CT FR PLAS OPC SPRAY X 16,5 ML')).toMatchObject({
      dosage: '',
      composition: '550 mcg/mL',
    });
    expect(parsePresentation('500 MG COM CT BL X 20').composition).toBe('');
  });
});

describe('tagsForClass', () => {
  it('traduz a classe terapêutica em tags, da mais específica para a mais geral', () => {
    expect(tagsForClass('N2B2')).toEqual(['Dor', 'Febre']);
    expect(tagsForClass('R6A')).toEqual(['Alergia']);
    expect(tagsForClass('C9C')).toEqual(['Pressão alta']);
    expect(tagsForClass('C10A1')).toEqual(['Colesterol']);
    expect(tagsForClass('A10P1')).toEqual(['Diabetes']);
    expect(tagsForClass('J5B3')).toEqual(['Herpes']);
  });

  it('não confunde A1 com A10 nem inventa tag para o que não conhece', () => {
    expect(tagsForClass('A1A')).toEqual([]);
    expect(tagsForClass('A7E1')).toEqual([]);
    expect(tagsForClass('L1H9')).toEqual([]);
    expect(tagsForClass('')).toEqual([]);
  });
});

describe('toCatalogMatch', () => {
  it('monta o que o formulário precisa a partir de uma linha da Anvisa', () => {
    const match = toCatalogMatch('7896004712673', [
      'ALERGALIV',
      '10 MG COM CT BL AL PLAS PVC/PVDC TRANS X 15',
      'LORATADINA',
      'R6A',
      'LEGRAND PHARMA INDUSTRIA FARMACEUTICA LTDA',
    ]);
    expect(match).toEqual({
      ean: '7896004712673',
      label: 'ALERGALIV 10 MG COM CT BL AL PLAS PVC/PVDC TRANS X 15',
      laboratory: 'Legrand pharma industria farmaceutica ltda',
      prefill: {
        name: 'Alergaliv',
        dosage: '10 mg',
        unit: 'comprimido',
        quantity: 15,
        tags: ['Alergia'],
        notes: 'Princípio ativo: loratadina.',
      },
    });
  });

  it('não repete o princípio ativo em genéricos e anota a composição', () => {
    const generic = toCatalogMatch('0', [
      'LOSARTANA POTÁSSICA',
      '50 MG COM X 30',
      'LOSARTANA POTÁSSICA',
      'C9C',
      'EMS',
    ]);
    expect(generic.prefill.notes).toBe('');
    const combo = toCatalogMatch('0', [
      'MIORRELAX',
      '300 MG + 50 MG + 35 MG COM CT BL X 30',
      'DIPIRONA;CAFEÍNA;CITRATO DE ORFENADRINA',
      'M3B',
      'EMS',
    ]);
    expect(combo.prefill.notes).toBe(
      'Princípio ativo: dipirona + cafeína + citrato de orfenadrina.\nDosagem: 300 mg + 50 mg + 35 mg.',
    );
  });
});

describe('catálogo gerado (public/catalogo)', () => {
  const dir = new URL('../../public/catalogo/', import.meta.url);
  const files = readdirSync(dir).filter((name) => /^\d\d\.json$/.test(name));
  const shards = files.map(
    (name) =>
      [
        name.slice(0, 2),
        JSON.parse(readFileSync(new URL(name, dir), 'utf8')) as CatalogShard,
      ] as const,
  );

  it('tem os 100 arquivos, cada código no arquivo certo e com as cinco colunas', () => {
    expect(files).toHaveLength(100);
    let codes = 0;
    for (const [key, shard] of shards) {
      for (const [ean, record] of Object.entries(shard)) {
        codes += 1;
        if (!isValidEan13(ean) || catalogShard(ean) !== key)
          throw new Error(`código fora do lugar: ${ean}`);
        if (record.length !== 5 || !record.every((field) => typeof field === 'string')) {
          throw new Error(`linha malformada: ${ean}`);
        }
      }
    }
    expect(codes).toBeGreaterThan(20_000);
  });

  it('todo o catálogo vira um preenchimento que o formulário aceita', () => {
    for (const [, shard] of shards) {
      for (const [ean, record] of Object.entries(shard)) {
        const { prefill } = toCatalogMatch(ean, record);
        const result = parseMedicineInput({
          ...prefill,
          lowThreshold: 0,
          expiresOn: null,
          schedules: [],
        });
        if (!result.ok) throw new Error(`${ean} ${record[0]} ${record[1]}: ${result.error}`);
        if (prefill.dosage && !parseDosage(prefill.dosage))
          throw new Error(`dosagem ilegível: ${ean}`);
      }
    }
  });
});
