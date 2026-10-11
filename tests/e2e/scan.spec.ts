import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { expectAlergaliv, login } from './helpers';

/** Alergaliv 10 mg com 15 comprimidos: o código das imagens em fixtures/ (veja make-barcode.mjs). */
const EAN = '7896004712673';
const PHOTO = fileURLToPath(new URL('fixtures/caixa.png', import.meta.url));

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto('/remedios/novo');
  await page.getByRole('dialog').getByRole('button', { name: 'Ler código de barras' }).click();
});

test('digitando o código de barras, preenche o formulário e salva', async ({ page }) => {
  const sheet = page.getByRole('dialog');
  const reader = sheet.getByRole('region', { name: 'Leitor de código de barras' });
  // Sem câmera no navegador de teste, o leitor oferece a foto e os números.
  await expect(reader.getByRole('status')).toContainText('A câmera não abriu');

  await reader.getByLabel('Ou digite os números do código de barras').fill(EAN);
  await reader.getByRole('button', { name: 'Buscar' }).click();

  await expect(
    page.getByRole('status').filter({ hasText: 'Dados da caixa preenchidos' }),
  ).toBeVisible();
  await expect(reader).toHaveCount(0);
  await expectAlergaliv(sheet);

  await sheet.getByRole('button', { name: 'Salvar remédio' }).click();
  await expect(sheet.getByRole('heading', { name: 'Alergaliv' })).toBeVisible();
  await expect(sheet).toContainText('10 mg');
  await expect(sheet.getByTestId('quantidade')).toHaveText('15');
  await expect(sheet.getByRole('list', { name: 'Pra que serve' })).toHaveText('Alergia');
});

test('lê o código de barras de uma foto', async ({ page }) => {
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Tirar foto do código').setInputFiles(PHOTO);
  await expectAlergaliv(sheet);
});

test('avisa quando o código não está na lista ou não é um código de barras', async ({ page }) => {
  const reader = page.getByRole('region', { name: 'Leitor de código de barras' });
  const code = reader.getByLabel('Ou digite os números do código de barras');

  await code.fill('123');
  await code.press('Enter');
  await expect(reader.getByRole('status')).toHaveText(
    'Confira os números: o código de barras da caixa tem 13 dígitos.',
  );

  // Um código válido, de uso interno de loja, que nenhum remédio tem.
  await code.fill('2000000000008');
  await code.press('Enter');
  await expect(reader.getByRole('status')).toHaveText(
    'O código 2000000000008 não está na lista da Anvisa. Preencha os dados à mão.',
  );

  // Enter no leitor não envia o formulário do remédio.
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveCount(0);
  await reader.getByRole('button', { name: 'Fechar leitor' }).click();
  await expect(reader).toHaveCount(0);
});
