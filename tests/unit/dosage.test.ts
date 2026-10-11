import { describe, expect, it } from 'vitest';
import { DOSAGE_UNITS, formatDosage, parseDosage } from '../../shared/dosage';

describe('formatDosage', () => {
  it('escreve como na caixa', () => {
    expect(formatDosage({ amount: 500, unit: 'mg' })).toBe('500 mg');
    expect(formatDosage({ amount: 2000, unit: 'UI' })).toBe('2.000 UI');
    expect(formatDosage({ amount: 0.9, unit: '%' })).toBe('0,9%');
    expect(formatDosage({ amount: 0.025, unit: 'mg' })).toBe('0,025 mg');
  });
});

describe('parseDosage', () => {
  it('lê de volta o que formatDosage escreve, em todas as medidas', () => {
    for (const unit of DOSAGE_UNITS) {
      for (const amount of [0.025, 0.9, 1, 500, 1000, 2000.5, 1_200_000]) {
        expect(parseDosage(formatDosage({ amount, unit }))).toEqual({ amount, unit });
      }
    }
  });

  it('aceita variações de quem digita', () => {
    expect(parseDosage('500mg')).toEqual({ amount: 500, unit: 'mg' });
    expect(parseDosage('  0.5 G ')).toEqual({ amount: 0.5, unit: 'g' });
    expect(parseDosage('20 mg/ml')).toEqual({ amount: 20, unit: 'mg/mL' });
    expect(parseDosage('2,5 ML')).toEqual({ amount: 2.5, unit: 'mL' });
    expect(parseDosage('0.025 mg')).toEqual({ amount: 0.025, unit: 'mg' });
  });

  it('trata o ponto como separador de milhares só no formato brasileiro', () => {
    expect(parseDosage('1.000 mg')).toEqual({ amount: 1000, unit: 'mg' });
    expect(parseDosage('1.5 g')).toEqual({ amount: 1.5, unit: 'g' });
  });

  it('recusa medida desconhecida, texto solto e valores fora do limite', () => {
    expect(parseDosage('500 colheres')).toBeNull();
    expect(parseDosage('forte')).toBeNull();
    expect(parseDosage('mg')).toBeNull();
    expect(parseDosage('500')).toBeNull();
    expect(parseDosage('0 mg')).toBeNull();
    expect(parseDosage('1,2,3 mg')).toBeNull();
    expect(parseDosage('99.999.999 mg')).toBeNull();
    expect(parseDosage('')).toBeNull();
  });
});
