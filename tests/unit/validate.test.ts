import { describe, expect, it } from 'vitest';
import { parseMedicineInput, parseSettings } from '../../shared/validate';

const valid = {
  name: '  Dipirona  ',
  dosage: '500 mg',
  tags: ['Dor', 'Febre'],
  unit: 'comprimido',
  quantity: 20,
  lowThreshold: 5,
  expiresOn: '2027-03',
  notes: 'Gaveta do banheiro',
  schedules: [{ time: '08:00', days: [1, 3, 5, 1], dose: 1 }],
};

const error = (input: unknown) => {
  const result = parseMedicineInput(input);
  return result.ok ? null : result.error;
};

describe('parseMedicineInput', () => {
  it('aceita um remédio completo e limpa os dados', () => {
    const result = parseMedicineInput(valid);
    expect(result).toEqual({
      ok: true,
      value: {
        ...valid,
        name: 'Dipirona',
        schedules: [{ id: undefined, time: '08:00', days: [1, 3, 5], dose: 1 }],
      },
    });
  });

  it('preenche os opcionais', () => {
    const result = parseMedicineInput({ name: 'Soro' });
    expect(result.ok && result.value).toEqual({
      name: 'Soro',
      dosage: '',
      tags: [],
      unit: 'comprimido',
      quantity: 0,
      lowThreshold: 0,
      expiresOn: null,
      notes: '',
      schedules: [],
    });
  });

  it('exige nome', () => {
    expect(error({ ...valid, name: '   ' })).toBe('Informe o nome do remédio.');
    expect(error(null)).toBe('Dados inválidos.');
  });

  it('recusa quantidade negativa ou que não é número', () => {
    expect(error({ ...valid, quantity: -1 })).toMatch(/quantidade/);
    expect(error({ ...valid, quantity: '20' })).toMatch(/quantidade/);
    expect(error({ ...valid, quantity: Number.NaN })).toMatch(/quantidade/);
    expect(error({ ...valid, lowThreshold: -2 })).toMatch(/aviso de estoque/);
  });

  it('arredonda para duas casas', () => {
    const result = parseMedicineInput({ ...valid, quantity: 2.456 });
    expect(result.ok && result.value.quantity).toBe(2.46);
  });

  it('recusa unidade e validade desconhecidas', () => {
    expect(error({ ...valid, unit: 'caixa' })).toBe('Unidade desconhecida.');
    expect(error({ ...valid, expiresOn: '03/2027' })).toMatch(/Validade/);
  });

  it('trata validade vazia como sem validade', () => {
    const result = parseMedicineInput({ ...valid, expiresOn: '' });
    expect(result.ok && result.value.expiresOn).toBeNull();
  });

  it('recusa horário sem hora válida, sem dose ou sem dia', () => {
    const withSchedule = (schedule: unknown) => error({ ...valid, schedules: [schedule] });
    expect(withSchedule({ time: '25:00', days: [1], dose: 1 })).toMatch(/horário/);
    expect(withSchedule({ time: '08:00', days: [], dose: 1 })).toMatch(/horário/);
    expect(withSchedule({ time: '08:00', days: [7], dose: 1 })).toMatch(/horário/);
    expect(withSchedule({ time: '08:00', days: [1], dose: 0 })).toMatch(/horário/);
  });

  it('guarda a dosagem no formato da caixa e recusa o que não é número com medida', () => {
    const dosageOf = (dosage: unknown) => {
      const result = parseMedicineInput({ ...valid, dosage });
      return result.ok ? result.value.dosage : null;
    };
    expect(dosageOf('2000ui')).toBe('2.000 UI');
    expect(dosageOf('0.9 %')).toBe('0,9%');
    expect(dosageOf('  ')).toBe('');
    expect(error({ ...valid, dosage: 'forte' })).toMatch(/Dosagem inválida/);
    expect(error({ ...valid, dosage: '500 colheres' })).toMatch(/Dosagem inválida/);
    expect(error({ ...valid, dosage: 500 })).toMatch(/Dosagem inválida/);
  });

  it('limpa as tags, tira as repetidas e limita quantidade e tamanho', () => {
    const tagsOf = (patch: object) => {
      const result = parseMedicineInput({ ...valid, ...patch });
      return result.ok ? result.value.tags : null;
    };
    expect(tagsOf({ tags: [' dor ', 'Dor', 'pressao alta', ''] })).toEqual(['Dor', 'Pressão alta']);
    expect(tagsOf({ tags: undefined })).toEqual([]);
    expect(error({ ...valid, tags: 'Dor' })).toMatch(/tags precisam ser textos/);
    expect(error({ ...valid, tags: ['Dor', 5] })).toMatch(/tags precisam ser textos/);
    expect(error({ ...valid, tags: ['x'.repeat(31)] })).toMatch(/até 8 tags de até 30 letras/);
    expect(error({ ...valid, tags: 'abcdefghi'.split('') })).toMatch(/até 8 tags/);
  });

  it('aceita o texto livre de antes das tags, enviado por um app antigo em cache', () => {
    const result = parseMedicineInput({ ...valid, tags: undefined, purpose: 'Dor e febre' });
    expect(result.ok && result.value.tags).toEqual(['Dor', 'Febre']);
  });

  it('recusa textos longos demais', () => {
    expect(error({ ...valid, notes: 'x'.repeat(4001) })).toMatch(/longas demais/);
  });
});

describe('parseSettings', () => {
  it('aceita ajustes válidos', () => {
    expect(parseSettings({ expiryWarnDays: 45, alertTime: '08:30' })).toEqual({
      ok: true,
      value: { expiryWarnDays: 45, alertTime: '08:30' },
    });
  });

  it('recusa antecedência fora de 1 a 365 e horário inválido', () => {
    expect(parseSettings({ expiryWarnDays: 0, alertTime: '08:30' }).ok).toBe(false);
    expect(parseSettings({ expiryWarnDays: 400, alertTime: '08:30' }).ok).toBe(false);
    expect(parseSettings({ expiryWarnDays: 1.5, alertTime: '08:30' }).ok).toBe(false);
    expect(parseSettings({ expiryWarnDays: 30, alertTime: '8h' }).ok).toBe(false);
  });
});
