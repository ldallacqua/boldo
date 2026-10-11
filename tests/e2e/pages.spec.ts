import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { expectAlergaliv, PASSWORD } from './helpers';

/**
 * A hospedagem gratuita de verdade: o app em uma subpasta de um site estático (GitHub Pages)
 * e a API em OUTRO endereço. Aqui o "Pages" é scripts/serve-pages.mjs e a API é o servidor
 * de teste, mas o que importa é igual: prefixo de caminho, CORS e sessão por token.
 */

const API = 'http://localhost:4173';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
});

test('entra, cadastra e lê os dados pela API em outra origem', async ({ page }, info) => {
  const name = `Pages ${info.project.name} ${Date.now()}`;
  const calls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/')) calls.push(new URL(request.url()).origin);
  });

  await page.getByRole('link', { name: 'Remédios' }).click();
  await expect(page).toHaveURL(/\/boldo\/remedios$/);
  await page.getByRole('link', { name: 'Adicionar remédio' }).click();
  await expect(page).toHaveURL(/\/boldo\/remedios\/novo$/);

  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Nome', { exact: true }).fill(name);
  await sheet.getByLabel('Quantidade em casa').fill('12');
  await sheet.getByRole('button', { name: 'Salvar remédio' }).click();
  await expect(sheet.getByRole('heading', { name })).toBeVisible();
  await expect(sheet.getByTestId('quantidade')).toHaveText('12');

  expect(calls.length).toBeGreaterThan(0);
  expect(new Set(calls)).toEqual(new Set([API]));
});

test('o leitor de código de barras acha o catálogo e o leitor dentro da subpasta', async ({
  page,
}) => {
  const fetched: string[] = [];
  page.on('response', (response) => {
    if (/catalogo\/|\.wasm/.test(response.url())) {
      fetched.push(`${response.status()} ${new URL(response.url()).pathname}`);
    }
  });

  await page.goto('./remedios/novo');
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Ler código de barras' }).click();
  await sheet
    .getByLabel('Tirar foto do código')
    .setInputFiles(fileURLToPath(new URL('fixtures/caixa.png', import.meta.url)));
  await expectAlergaliv(sheet);

  expect(fetched).toContain('200 /boldo/catalogo/73.json');
  expect(fetched.some((line) => /^200 \/boldo\/assets\/.+\.wasm$/.test(line))).toBe(true);
});

test('recarregar em um endereço interno continua no app (404.html do Pages)', async ({ page }) => {
  await page.getByRole('link', { name: 'Ajustes' }).click();
  await expect(page).toHaveURL(/\/boldo\/ajustes$/);

  const response = await page.reload();
  // O Pages devolve o app com status 404; o que vale é a tela certa aparecer, já logada.
  expect(response!.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Ajustes', level: 1 })).toBeVisible();
});

test('sair e voltar pede a senha de novo', async ({ page }) => {
  await page.getByRole('link', { name: 'Ajustes' }).click();
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByLabel('Senha')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Senha')).toBeVisible();
});

test('manifesto, ícones e mascote usam o prefixo da subpasta', async ({ page, request }) => {
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toMatch(/^\/boldo\//);
  const manifest = await (await request.get(href!)).json();
  expect(manifest).toMatchObject({ start_url: '/boldo/', scope: '/boldo/', id: '/boldo/' });
  for (const icon of manifest.icons) {
    expect(icon.src).toMatch(/^\/boldo\/icons\//);
    expect((await request.get(icon.src)).status(), icon.src).toBe(200);
  }

  const images = await page.locator('img').evaluateAll((list) =>
    list.map((img) => ({
      src: (img as HTMLImageElement).src,
      loaded: (img as HTMLImageElement).naturalWidth > 0,
    })),
  );
  expect(images.length).toBeGreaterThan(0);
  for (const image of images) {
    expect(image.src).toContain('/boldo/');
    expect(image.loaded, image.src).toBe(true);
  }
});

test('o service worker assume a subpasta e o app abre sem internet', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();
  await page.goto('./');
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toMatch(/\/boldo\/$/);
  await page.evaluate(async () => {
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
      );
    }
  });

  await context.setOffline(true);
  await page.goto('./remedios');
  await expect(page.getByLabel('Senha')).toBeVisible();
  await context.close();
});
