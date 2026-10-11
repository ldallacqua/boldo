import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import type { Medicine, MedicineInput } from '../../shared/types';

/** A mesma senha que o playwright.config.ts passa para o servidor de teste. */
export const PASSWORD = 'senha-e2e';

export async function login(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
}

/** O banco é compartilhado entre testes e tamanhos de tela; nomes únicos evitam colisão. */
export function unique(testInfo: TestInfo, name: string): string {
  return `${name} ${testInfo.project.name} ${Math.random().toString(36).slice(2, 7)}`;
}

/** Chama a API com a sessão que a página guardou ao entrar. */
export async function api(page: Page) {
  const token = await page.evaluate(() => localStorage.getItem('boldo.token'));
  const headers = { Authorization: `Bearer ${token}` };
  return {
    get: async (path: string) => (await page.request.get(path, { headers })).json(),
    post: (path: string, data: unknown) => page.request.post(path, { headers, data }),
  };
}

/** Cadastra direto pela API quando o cadastro em si não é o que está em teste. */
export async function createMedicine(
  page: Page,
  input: Partial<MedicineInput> & { name: string },
): Promise<Medicine> {
  const response = await (
    await api(page)
  ).post('/api/medicines', {
    dosage: '',
    tags: [],
    unit: 'comprimido',
    quantity: 20,
    lowThreshold: 0,
    expiresOn: null,
    notes: '',
    schedules: [],
    ...input,
  });
  expect(response.status()).toBe(201);
  return response.json();
}

/** Quanto há em estoque, perguntando ao servidor (não à tela). */
export async function stockOf(page: Page, medicineId: number): Promise<number> {
  const list: Medicine[] = await (await api(page)).get('/api/medicines');
  return list.find((medicine) => medicine.id === medicineId)!.quantity;
}

export const row = (page: Page, name: string) =>
  page.getByRole('list').getByRole('link', { name: new RegExp(name) });

export const everyDay = [0, 1, 2, 3, 4, 5, 6] as MedicineInput['schedules'][number]['days'];

/** O formulário depois de ler o código das imagens de fixtures/ (Alergaliv 10 mg, 15 comprimidos). */
export async function expectAlergaliv(sheet: Locator) {
  await expect(sheet.getByLabel('Nome', { exact: true })).toHaveValue('Alergaliv');
  await expect(sheet.getByLabel('Valor da dosagem')).toHaveValue('10');
  await expect(sheet.getByLabel('Medida da dosagem')).toHaveValue('mg');
  await expect(sheet.getByLabel('Quantidade em casa')).toHaveValue('15');
  await expect(sheet.getByLabel('Unidade', { exact: true })).toHaveValue('comprimido');
  await expect(sheet.getByRole('button', { name: 'Remover Alergia' })).toBeVisible();
  await expect(sheet.getByLabel('Anotações')).toHaveValue('Princípio ativo: loratadina.');
  await expect(sheet.getByText('Confira antes de salvar.')).toBeVisible();
  await expect(sheet.getByText('ALERGALIV 10 MG COM CT BL')).toBeVisible();
}
