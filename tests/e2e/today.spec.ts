import { expect, test } from '@playwright/test';
import { createMedicine, everyDay, login, unique } from './helpers';

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
  const stock = async () => {
    const list = await (await page.request.get('/api/medicines')).json();
    return list.find((m: { id: number }) => m.id === medicine.id).quantity;
  };

  await page.goto('/');
  const doses = page.getByRole('region', { name: 'Doses de hoje' });
  const dose = doses.getByRole('listitem').filter({ hasText: medicine.name });
  await expect(dose).toContainText('00:01');
  await expect(dose).toContainText('2 comprimidos');
  await expect(dose).toContainText('Atrasada');

  await dose.getByRole('button', { name: /^Tomei/ }).click();
  await expect(dose).toContainText(/Tomado às \d{2}:\d{2}/);
  await expect(dose.getByRole('button', { name: /^Tomei/ })).toHaveCount(0);
  expect(await stock()).toBe(8);

  await dose.getByRole('button', { name: /^Desfazer/ }).click();
  await expect(dose.getByRole('button', { name: /^Tomei/ })).toBeVisible();
  expect(await stock()).toBe(10);

  await dose.getByRole('button', { name: /^Pular/ }).click();
  await expect(dose).toContainText('Pulado');
  expect(await stock()).toBe(10);
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
