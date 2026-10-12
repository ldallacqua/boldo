import { expect, test } from '@playwright/test';
import { createMedicine, everyDay, login, stockOf, unique } from './helpers';

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('mostra o dia de hoje e um resumo', async ({ page }) => {
  await page.goto('/');
  const weekday = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date());
  await expect(page.getByRole('heading', { level: 1 })).toContainText(new RegExp(weekday, 'i'));
});

test('avisa do que está acabando e do que venceu', async ({ page }, info) => {
  const low = await createMedicine(page, {
    name: unique(info, 'Acabando'),
    quantity: 2,
    lowThreshold: 5,
  });
  const gone = await createMedicine(page, {
    name: unique(info, 'Zerado'),
    unit: 'ampola',
    quantity: 0,
  });
  const expired = await createMedicine(page, {
    name: unique(info, 'Vencido'),
    expiresOn: '2020-01',
  });
  const fine = await createMedicine(page, { name: unique(info, 'Tranquilo'), quantity: 90 });

  await page.goto('/');
  const attention = page.getByRole('region', { name: 'Precisa de atenção' });
  await expect(attention.getByRole('link', { name: new RegExp(low.name) })).toContainText(
    'Acabando: restam 2 comprimidos',
  );
  await expect(attention.getByRole('link', { name: new RegExp(gone.name) })).toContainText(
    'Acabou',
  );
  await expect(attention.getByRole('link', { name: new RegExp(expired.name) })).toContainText(
    'Venceu em 01/2020',
  );
  await expect(attention.getByRole('link', { name: new RegExp(fine.name) })).toHaveCount(0);
  await expect(page.locator('.resumo')).toContainText(/precisam? de atenção/);

  // O aviso leva direto ao remédio.
  await attention.getByRole('link', { name: new RegExp(low.name) }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: low.name })).toBeVisible();
});

test('registra a dose, desconta do estoque e desfaz', async ({ page }, info) => {
  const medicine = await createMedicine(page, {
    name: unique(info, 'Losartana'),
    dosage: '50 mg',
    quantity: 10,
    schedules: [{ time: '00:01', days: everyDay, dose: 2 }],
  });
  const stock = () => stockOf(page, medicine.id);

  await page.goto('/');
  const doses = page.getByRole('region', { name: 'Doses de hoje' });
  const dose = doses.getByRole('listitem').filter({ hasText: medicine.name });
  await expect(dose).toContainText('00:01');
  await expect(dose).toContainText('2 comprimidos');
  await expect(dose).toContainText('Atrasada');

  await dose.getByRole('button', { name: /^Tomei/ }).click();
  await expect(dose).toContainText(/Tomado às \d{2}:\d{2}/);
  await expect(dose.getByRole('button', { name: /^Tomei/ })).toHaveCount(0);
  // A tela muda no toque, antes de o servidor responder: o estoque é conferido com espera.
  await expect.poll(stock).toBe(8);

  await dose.getByRole('button', { name: /^Desfazer/ }).click();
  await expect(dose.getByRole('button', { name: /^Tomei/ })).toBeVisible();
  await expect.poll(stock).toBe(10);

  await dose.getByRole('button', { name: /^Pular/ }).click();
  await expect(dose).toContainText('Pulado');
  await expect.poll(stock).toBe(10);
});

test('o anel do dia acompanha as doses registradas', async ({ page }, info) => {
  const medicine = await createMedicine(page, {
    name: unique(info, 'Anel'),
    schedules: [{ time: '00:02', days: everyDay, dose: 1 }],
  });
  await page.goto('/');
  const ring = page.getByRole('img', { name: /de \d+ doses registradas/ });
  const done = async () => Number((await ring.getAttribute('aria-label'))!.split(' ')[0]);
  const before = await done();

  const dose = page.getByRole('listitem').filter({ hasText: medicine.name });
  await dose.getByRole('button', { name: /^Tomei/ }).click();
  await expect.poll(done).toBe(before + 1);
  // Continua valendo depois de o servidor confirmar.
  await page.reload();
  await expect.poll(done).toBe(before + 1);

  await dose.getByRole('button', { name: /^Desfazer/ }).click();
  await expect.poll(done).toBe(before);
});

test('tomar a última dose faz o remédio aparecer como acabado', async ({ page }, info) => {
  const medicine = await createMedicine(page, {
    name: unique(info, 'Ultimo'),
    quantity: 1,
    schedules: [{ time: '00:01', days: everyDay, dose: 1 }],
  });

  await page.goto('/');
  const dose = page
    .getByRole('region', { name: 'Doses de hoje' })
    .getByRole('listitem')
    .filter({ hasText: medicine.name });
  await dose.getByRole('button', { name: /^Tomei/ }).click();

  const attention = page.getByRole('region', { name: 'Precisa de atenção' });
  await expect(attention.getByRole('link', { name: new RegExp(medicine.name) })).toContainText(
    'Acabou',
  );
});

test('um remédio aberto pela tela Hoje volta para ela ao fechar', async ({ page }, info) => {
  const medicine = await createMedicine(page, { name: unique(info, 'Volta'), quantity: 0 });
  await page.goto('/');
  await page
    .getByRole('region', { name: 'Precisa de atenção' })
    .getByRole('link', { name: new RegExp(medicine.name) })
    .click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('link', { name: 'Editar' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Fechar' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Doses de hoje' })).toBeVisible();
});
