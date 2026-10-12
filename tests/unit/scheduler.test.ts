import { beforeEach, describe, expect, it } from 'vitest';
import { runTick } from '../../server/scheduler';
import type { Store } from '../../server/store';
import { everyDay, fakeSender, input, memoryStore, testTokens } from './helpers';

const TZ = 'America/Sao_Paulo';
/** Segunda-feira, 12/10/2026, no horário de São Paulo (UTC-3). */
const at = (time: string, date = '2026-10-12') => new Date(`${date}T${time}:00-03:00`);

let store: Store;
let sender: ReturnType<typeof fakeSender>;
const tokens = testTokens();
const tick = (time: string, date?: string) =>
  runTick({ store, sender, timezone: TZ, tokens }, at(time, date));
const titles = () => sender.sent.map((payload) => payload.title);

beforeEach(async () => {
  store = await memoryStore();
  sender = fakeSender();
});

describe('lembretes de dose', () => {
  const losartana = () =>
    store.createMedicine(
      input({
        name: 'Losartana',
        dosage: '50 mg',
        quantity: 28,
        schedules: [{ time: '08:00', days: everyDay, dose: 1 }],
      }),
      at('06:00').toISOString(),
    );

  it('não avisa antes da hora', async () => {
    await losartana();
    await tick('07:59');
    expect(sender.sent).toEqual([]);
  });

  it('avisa na hora, com o que tomar e os dados para o botão "Tomei"', async () => {
    const medicine = await losartana();
    await tick('08:00');
    // O remédio acompanha o aviso, para o envio pular os aparelhos que o silenciaram.
    expect(sender.medicineIds).toEqual([medicine.id]);
    expect(sender.sent).toEqual([
      {
        title: 'Hora de tomar Losartana',
        body: '1 comprimido (50 mg) às 08:00',
        tag: `dose-${medicine.schedules[0].id}-2026-10-12`,
        url: '/',
        dose: {
          scheduleId: medicine.schedules[0].id,
          date: '2026-10-12',
          token: tokens.dose(medicine.schedules[0].id, '2026-10-12'),
        },
      },
    ]);
  });

  it('avisa uma vez só, por mais que o agendador rode', async () => {
    await losartana();
    await tick('08:00');
    await tick('08:01');
    await tick('08:29');
    expect(sender.sent).toHaveLength(1);
  });

  it('lembra de novo meia hora depois se ninguém registrou, e só mais uma vez', async () => {
    const medicine = await losartana();
    await tick('08:00');
    await tick('08:30');
    await tick('08:31');
    await tick('09:10');
    expect(titles()).toEqual(['Hora de tomar Losartana', 'Ainda falta tomar Losartana']);
    // Entra no lugar do primeiro aviso (mesma tag), tocando de novo, e também tem o "Tomei".
    expect(sender.sent[1]).toMatchObject({
      tag: sender.sent[0].tag,
      renotify: true,
      dose: { scheduleId: medicine.schedules[0].id, date: '2026-10-12' },
    });
  });

  it('não repete o lembrete de dose tomada ou pulada', async () => {
    const medicine = await losartana();
    await tick('08:00');
    await store.recordIntake(
      medicine.schedules[0].id,
      '2026-10-12',
      'skipped',
      at('08:10').toISOString(),
    );
    await tick('08:30');
    await tick('09:00');
    expect(sender.sent).toHaveLength(1);
  });

  it('a repetição conta do primeiro lembrete, não do horário da dose', async () => {
    await losartana();
    await tick('08:45'); // o servidor voltou atrasado
    await tick('08:50');
    expect(sender.sent).toHaveLength(1);
    await tick('09:15');
    expect(sender.sent).toHaveLength(2);
  });

  it('não repete um lembrete velho', async () => {
    await losartana();
    await tick('08:00');
    await tick('10:30');
    expect(sender.sent).toHaveLength(1);
  });

  it('avisa de novo no dia seguinte', async () => {
    await losartana();
    await tick('08:00');
    await tick('08:00', '2026-10-13');
    expect(sender.sent).toHaveLength(2);
  });

  it('não avisa se a dose já foi registrada', async () => {
    const medicine = await losartana();
    await store.recordIntake(
      medicine.schedules[0].id,
      '2026-10-12',
      'taken',
      at('07:50').toISOString(),
    );
    await tick('08:00');
    expect(sender.sent).toEqual([]);
  });

  it('recupera o lembrete se o servidor voltou em até uma hora', async () => {
    await losartana();
    await tick('08:45');
    expect(sender.sent).toHaveLength(1);
  });

  it('não manda lembrete velho depois de uma hora', async () => {
    await losartana();
    await tick('09:30');
    expect(sender.sent).toEqual([]);
  });

  it('respeita os dias da semana', async () => {
    await store.createMedicine(
      input({ schedules: [{ time: '08:00', days: [0, 6], dose: 1 }] }),
      at('06:00').toISOString(),
    );
    await tick('08:00'); // segunda
    expect(sender.sent).toEqual([]);
    await tick('08:00', '2026-10-17'); // sábado
    expect(sender.sent).toHaveLength(1);
  });
});

describe('avisos de estoque', () => {
  it('avisa quando está acabando, uma vez só', async () => {
    await store.createMedicine(input({ quantity: 4, lowThreshold: 6 }), at('06:00').toISOString());
    await tick('10:00');
    await tick('10:01');
    await tick('10:00', '2026-10-13');
    expect(sender.sent).toEqual([
      {
        title: 'Dipirona está acabando',
        body: 'Restam 4 comprimidos.',
        tag: 'stock-1',
        url: '/remedios/1',
      },
    ]);
  });

  it('avisa de novo quando zera', async () => {
    const { id } = await store.createMedicine(input({ quantity: 1, lowThreshold: 6 }), 'x');
    await tick('10:00');
    await store.adjustQuantity(id, -1, 'x');
    await tick('10:05');
    expect(titles()).toEqual(['Dipirona está acabando', 'Dipirona acabou']);
    expect(sender.sent[0].body).toBe('Resta 1 comprimido.');
  });

  it('rearma o aviso depois de repor o estoque', async () => {
    const { id } = await store.createMedicine(input({ quantity: 4, lowThreshold: 6 }), 'x');
    await tick('10:00');
    await store.adjustQuantity(id, 20, 'x');
    await tick('10:05');
    await store.adjustQuantity(id, -20, 'x');
    await tick('10:10');
    expect(titles()).toEqual(['Dipirona está acabando', 'Dipirona está acabando']);
  });

  it('não avisa de quem tem estoque', async () => {
    await store.createMedicine(input({ quantity: 20, lowThreshold: 6 }), 'x');
    await tick('10:00');
    expect(sender.sent).toEqual([]);
  });
});

describe('avisos de validade', () => {
  it('avisa quando entra na antecedência e de novo quando vence', async () => {
    await store.createMedicine(input({ expiresOn: '2026-10' }), 'x');
    await tick('10:00');
    await tick('10:00', '2026-10-20');
    expect(sender.sent).toEqual([
      {
        title: 'Dipirona vence em 19 dias',
        body: 'Validade: 10/2026.',
        tag: 'expiry-1',
        url: '/remedios/1',
      },
    ]);

    await tick('10:00', '2026-11-01');
    expect(titles()).toEqual(['Dipirona vence em 19 dias', 'Dipirona venceu']);
    expect(sender.sent[1].body).toBe('Validade: 10/2026. Descarte em um ponto de coleta.');
  });

  it('fala "vence hoje" no último dia', async () => {
    await store.createMedicine(input({ expiresOn: '2026-10' }), 'x');
    await tick('10:00', '2026-10-31');
    expect(titles()).toEqual(['Dipirona vence hoje']);
  });

  it('usa a antecedência dos ajustes', async () => {
    await store.createMedicine(input({ expiresOn: '2026-12' }), 'x');
    await tick('10:00');
    expect(sender.sent).toEqual([]);
    await store.saveSettings({ expiryWarnDays: 90, alertTime: '09:00' });
    await tick('10:01');
    expect(titles()).toEqual(['Dipirona vence em 80 dias']);
  });

  it('rearma se a validade for corrigida', async () => {
    const { id } = await store.createMedicine(input({ expiresOn: '2026-09' }), 'x');
    await tick('10:00');
    await store.updateMedicine(id, input({ expiresOn: '2028-01' }), 'x');
    await tick('10:01');
    await store.updateMedicine(id, input({ expiresOn: '2026-09' }), 'x');
    await tick('10:02');
    expect(titles()).toEqual(['Dipirona venceu', 'Dipirona venceu']);
  });

  it('ignora remédio sem validade', async () => {
    await store.createMedicine(input({ expiresOn: null }), 'x');
    await tick('10:00');
    expect(sender.sent).toEqual([]);
  });
});

describe('janela dos avisos', () => {
  it('segura estoque e validade até o horário configurado', async () => {
    await store.createMedicine(input({ quantity: 0 }), 'x');
    await tick('08:59');
    expect(sender.sent).toEqual([]);
    await tick('09:00');
    expect(titles()).toEqual(['Dipirona acabou']);
  });

  it('não manda estoque nem validade à noite, e manda na manhã seguinte', async () => {
    await store.createMedicine(input({ quantity: 0 }), 'x');
    await tick('21:00');
    await tick('23:30');
    expect(sender.sent).toEqual([]);
    await tick('09:00', '2026-10-13');
    expect(titles()).toEqual(['Dipirona acabou']);
  });

  it('lembrete de dose sai a qualquer hora', async () => {
    await store.createMedicine(
      input({ schedules: [{ time: '23:00', days: everyDay, dose: 1 }] }),
      'x',
    );
    await tick('23:00');
    expect(titles()).toEqual(['Hora de tomar Dipirona']);
  });
});

describe('várias instâncias ao mesmo tempo', () => {
  it('duas passadas simultâneas não repetem lembrete nem aviso', async () => {
    await store.createMedicine(
      input({ quantity: 2, schedules: [{ time: '10:00', days: everyDay, dose: 1 }] }),
      'x',
    );
    await Promise.all([tick('10:00'), tick('10:00'), tick('10:00')]);
    expect(titles().sort()).toEqual(['Dipirona está acabando', 'Hora de tomar Dipirona']);
  });
});
