import { describe, expect, it } from 'vitest';
import {
  normalizeTag,
  normalizeTags,
  splitPurpose,
  SUGGESTED_TAGS,
  tagKey,
} from '../../shared/tags';

describe('tagKey', () => {
  it('ignora acentos, maiúsculas e espaços sobrando', () => {
    expect(tagKey('  Pressão   Alta ')).toBe('pressao alta');
    expect(tagKey('INFLAMAÇÃO')).toBe(tagKey('inflamacao'));
  });
});

describe('normalizeTag', () => {
  it('limpa e põe inicial maiúscula', () => {
    expect(normalizeTag('  dor de   cabeça. ')).toBe('Dor de cabeça');
    expect(normalizeTag('TPM')).toBe('TPM');
    expect(normalizeTag(' , ')).toBe('');
  });

  it('usa a grafia da sugestão quando é a mesma tag', () => {
    expect(normalizeTag('pressao alta')).toBe('Pressão alta');
    expect(normalizeTag('FEBRE')).toBe('Febre');
  });

  it('as sugestões já estão na forma limpa e não se repetem', () => {
    expect(normalizeTags([...SUGGESTED_TAGS])).toEqual([...SUGGESTED_TAGS]);
  });
});

describe('normalizeTags', () => {
  it('tira vazias e repetidas, mantendo a primeira e a ordem', () => {
    expect(normalizeTags(['Dor', '', 'dor', 'Febre', ' DOR '])).toEqual(['Dor', 'Febre']);
  });
});

describe('splitPurpose', () => {
  it('separa o texto livre antigo em tags', () => {
    expect(splitPurpose('Dor e febre')).toEqual(['Dor', 'Febre']);
    expect(splitPurpose('Azia, refluxo; má digestão')).toEqual(['Azia', 'Refluxo', 'Má digestão']);
    expect(splitPurpose('Lavar o nariz')).toEqual(['Lavar o nariz']);
    expect(splitPurpose('')).toEqual([]);
  });

  it('não parte uma sugestão que tem "e" no nome', () => {
    expect(splitPurpose('gripe e resfriado')).toEqual(['Gripe e resfriado']);
  });

  it('não parte palavras que só contêm a letra e', () => {
    expect(splitPurpose('Dor de dente')).toEqual(['Dor de dente']);
  });
});
