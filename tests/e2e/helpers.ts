import { expect, type Page, type TestInfo } from '@playwright/test';
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

/** Cadastra direto pela API (com a sessão da página) quando o cadastro não é o que está em teste. */
export async function createMedicine(
  page: Page,
  input: Partial<MedicineInput> & { name: string },
): Promise<Medicine> {
  const response = await page.request.post('/api/medicines', {
    data: {
      dosage: '',
      purpose: '',
      unit: 'comprimido',
      quantity: 20,
      lowThreshold: 0,
      expiresOn: null,
      notes: '',
      schedules: [],
      ...input,
    },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

export const row = (page: Page, name: string) =>
  page.getByRole('list').getByRole('link', { name: new RegExp(name) });

export const everyDay = [0, 1, 2, 3, 4, 5, 6] as MedicineInput['schedules'][number]['days'];
