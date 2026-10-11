import { expect, test } from '@playwright/test';
import { login, PASSWORD } from './helpers';

test('pede a senha e recusa a errada', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Boldo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeDisabled();

  await page.getByLabel('Senha').fill('senha-errada');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toHaveText('Senha incorreta.');
  await expect(page.getByRole('navigation')).toHaveCount(0);
});

test('entra com a senha certa, continua logado ao recarregar e sai', async ({ page }) => {
  await page.goto('/remedios');
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByLabel('Senha').press('Enter');
  // Depois de entrar, cai na página que tinha sido pedida.
  await expect(page.getByRole('heading', { name: 'Remédios', level: 1 })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Remédios', level: 1 })).toBeVisible();

  await page.getByRole('link', { name: 'Ajustes' }).click();
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByLabel('Senha')).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Senha')).toBeVisible();
});

test('sem senha, a API não entrega nada', async ({ request }) => {
  for (const path of ['/api/medicines', '/api/today', '/api/export']) {
    expect((await request.get(path)).status(), path).toBe(401);
  }
});

test('a mesma farmacinha aparece em outro navegador', async ({ page, browser }, testInfo) => {
  const name = `Compartilhado ${testInfo.project.name} ${Date.now()}`;
  await login(page);
  await page.request.post('/api/medicines', { data: { name, quantity: 7 } });

  // Um navegador novo, sem nada guardado: só a senha.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await login(otherPage);
  await otherPage.goto('/remedios');
  await expect(otherPage.getByRole('link', { name: new RegExp(name) })).toContainText('7');
  await other.close();
});
