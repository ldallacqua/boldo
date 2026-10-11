import { expect, test } from '@playwright/test';
import { createMedicine, login, row, unique } from './helpers';

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('cadastra um remédio completo e mostra na lista e nos detalhes', async ({ page }, info) => {
  const name = unique(info, 'Dipirona');
  const year = String(new Date().getFullYear() + 2);

  await page.goto('/remedios');
  await page.getByRole('link', { name: 'Adicionar remédio' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Novo remédio' })).toBeVisible();

  await sheet.getByLabel('Nome', { exact: true }).fill(name);
  await sheet.getByLabel('Dosagem').fill('500 mg');
  await sheet.getByLabel('Pra que serve').fill('Dor e febre');
  await sheet.getByLabel('Quantidade em casa').fill('20');
  await sheet.getByLabel('Unidade').selectOption('capsula');
  await sheet.getByLabel('Avisar quando restar').fill('5');
  await sheet.getByLabel('Mês da validade').selectOption('08');
  await sheet.getByLabel('Ano da validade').selectOption(year);
  await sheet.getByLabel('Anotações').fill('Gaveta do banheiro.\nTomar depois de comer.');
  await sheet.getByRole('button', { name: 'Salvar remédio' }).click();

  await expect(page.getByRole('status')).toHaveText('Remédio salvo');
  await expect(sheet.getByRole('heading', { name })).toBeVisible();
  await expect(sheet).toContainText('500 mg');
  await expect(sheet).toContainText('Dor e febre');
  await expect(sheet.getByTestId('quantidade')).toHaveText('20');
  await expect(sheet).toContainText('cápsulas em casa');
  await expect(sheet).toContainText('Avisa quando restarem 5 cápsulas');
  await expect(sheet).toContainText(`08/${year}`);
  await expect(sheet).toContainText('Tomar depois de comer.');

  await sheet.getByRole('button', { name: 'Fechar' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(row(page, name)).toContainText('Dor e febre');
  await expect(row(page, name)).toContainText('20');
  await expect(row(page, name)).toContainText(`Validade 08/${year}`);
});

test('não salva sem nome e diz o que falta', async ({ page }) => {
  await page.goto('/remedios/novo');
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Quantidade em casa').fill('3');
  await sheet.getByRole('button', { name: 'Salvar remédio' }).click();
  await expect(sheet.getByRole('alert')).toHaveText('Informe o nome do remédio.');
  await expect(page).toHaveURL(/\/remedios\/novo$/);
});

test('ajusta a quantidade com os botões de mais e menos', async ({ page }, info) => {
  const medicine = await createMedicine(page, {
    name: unique(info, 'Ibuprofeno'),
    quantity: 2,
    lowThreshold: 1,
  });
  await page.goto(`/remedios/${medicine.id}`);
  const sheet = page.getByRole('dialog');
  const quantity = sheet.getByTestId('quantidade');

  await sheet.getByRole('button', { name: 'Pôr 1' }).click();
  await expect(quantity).toHaveText('3');

  await sheet.getByRole('button', { name: 'Tirar 1' }).click();
  await sheet.getByRole('button', { name: 'Tirar 1' }).click();
  await expect(quantity).toHaveText('1');
  await expect(sheet.getByText('Acabando', { exact: true })).toBeVisible();

  await sheet.getByRole('button', { name: 'Tirar 1' }).click();
  await expect(quantity).toHaveText('0');
  await expect(sheet.getByText('Acabou', { exact: true })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Tirar 1' })).toBeDisabled();

  // O número ficou gravado no servidor, não só na tela.
  await page.reload();
  await expect(page.getByRole('dialog').getByTestId('quantidade')).toHaveText('0');
});

test('edita um remédio, incluindo os horários', async ({ page }, info) => {
  const medicine = await createMedicine(page, { name: unique(info, 'Omeprazol'), quantity: 14 });
  const renamed = `${medicine.name} editado`;

  await page.goto(`/remedios/${medicine.id}`);
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('Sem lembrete de horário');
  await sheet.getByRole('link', { name: 'Editar' }).click();

  await sheet.getByLabel('Nome', { exact: true }).fill(renamed);
  await sheet.getByLabel('Anotações').fill('Em jejum.');
  await sheet.getByRole('button', { name: 'Adicionar horário' }).click();
  await sheet.getByLabel('Horário 1', { exact: true }).fill('07:15');
  await sheet.getByLabel('Dose do horário 1').fill('2');
  // Tira sábado e domingo.
  const days = sheet.getByRole('group', { name: 'Dias do horário 1' });
  await days.getByRole('button', { name: 'sábado' }).click();
  await days.getByRole('button', { name: 'domingo' }).click();
  await sheet.getByRole('button', { name: 'Salvar remédio' }).click();

  await expect(sheet.getByRole('heading', { name: renamed })).toBeVisible();
  await expect(sheet).toContainText('Em jejum.');
  await expect(sheet).toContainText('07:15');
  await expect(sheet).toContainText('2 comprimidos, seg a sex');
  await expect(sheet).toContainText('Dá para 9 dias');
});

test('exclui só depois de confirmar', async ({ page }, info) => {
  const medicine = await createMedicine(page, { name: unique(info, 'Loratadina') });
  await page.goto(`/remedios/${medicine.id}`);
  const sheet = page.getByRole('dialog');

  await sheet.getByRole('button', { name: 'Excluir', exact: true }).click();
  await sheet.getByRole('button', { name: 'Cancelar' }).click();
  await expect(sheet.getByRole('link', { name: 'Editar' })).toBeVisible();

  await sheet.getByRole('button', { name: 'Excluir', exact: true }).click();
  await sheet.getByRole('button', { name: 'Excluir remédio' }).click();
  await expect(page.getByRole('status')).toHaveText('Remédio excluído');
  await expect(page).toHaveURL(/\/remedios$/);
  await expect(row(page, medicine.name)).toHaveCount(0);
});

test('busca por nome ou por para que serve, ignorando acentos', async ({ page }, info) => {
  const tag = unique(info, 'zzbusca').replace(/ /g, '');
  const cough = await createMedicine(page, { name: `Xarope ${tag}`, purpose: 'Tosse' });
  const allergy = await createMedicine(page, { name: `Antialérgico ${tag}`, purpose: 'Rinite' });

  await page.goto('/remedios');
  const search = page.getByRole('searchbox', { name: 'Buscar remédio' });

  await search.fill(tag);
  await expect(row(page, cough.name)).toBeVisible();
  await expect(row(page, allergy.name)).toBeVisible();

  await search.fill(`antialergico ${tag}`);
  await expect(row(page, allergy.name)).toBeVisible();
  await expect(row(page, cough.name)).toHaveCount(0);

  await search.fill('nada-com-esse-nome');
  await expect(page.getByText('Nenhum remédio com esses critérios.')).toBeVisible();
  await page.getByRole('button', { name: 'Mostrar todos' }).click();
  await expect(row(page, cough.name)).toBeVisible();
});

test('filtra os que estão acabando e os que estão vencendo', async ({ page }, info) => {
  const low = await createMedicine(page, {
    name: unique(info, 'Pouco'),
    quantity: 2,
    lowThreshold: 5,
  });
  const expired = await createMedicine(page, { name: unique(info, 'Velho'), expiresOn: '2020-01' });
  const fine = await createMedicine(page, { name: unique(info, 'Normal'), quantity: 50 });

  await page.goto('/remedios');
  await expect(row(page, low.name)).toContainText('Acabando');
  await expect(row(page, expired.name)).toContainText('Vencido');

  const filters = page.getByRole('group', { name: 'Filtrar remédios' });
  await filters.getByRole('button', { name: /Acabando/ }).click();
  await expect(row(page, low.name)).toBeVisible();
  await expect(row(page, expired.name)).toHaveCount(0);
  await expect(row(page, fine.name)).toHaveCount(0);

  await filters.getByRole('button', { name: /Vencendo/ }).click();
  await expect(row(page, expired.name)).toBeVisible();
  await expect(row(page, low.name)).toHaveCount(0);

  await filters.getByRole('button', { name: /Todos/ }).click();
  await expect(row(page, fine.name)).toBeVisible();
});

test('abrir um remédio que não existe explica o que houve', async ({ page }) => {
  await page.goto('/remedios/999999');
  await expect(page.getByRole('dialog')).toContainText('Remédio não encontrado');
});
