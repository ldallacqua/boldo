import { expect, test } from '@playwright/test';
import { PASSWORD } from './helpers';

test('tem um manifesto instalável com ícones que existem', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();

  const manifest = await (await request.get(href!)).json();
  expect(manifest).toMatchObject({
    name: 'Boldo: farmacinha de casa',
    short_name: 'Boldo',
    display: 'standalone',
    start_url: '/',
    scope: '/',
    lang: 'pt-BR',
  });

  const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === 'maskable')).toBe(
    true,
  );
  for (const icon of manifest.icons) {
    const response = await request.get(icon.src);
    expect(response.status(), icon.src).toBe(200);
    expect(response.headers()['content-type']).toBe('image/png');
  }
  expect((await request.get('/icons/apple-touch-icon.png')).status()).toBe(200);
  expect((await request.get('/icons/badge-96.png')).status()).toBe(200);
});

test('registra o service worker e abre sem internet', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();

  // Espera o service worker assumir a página (é ele que guarda o app para uso offline).
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
      );
    }
  });

  await context.setOffline(true);
  await page.reload();
  // O app abre do cache e explica que não alcançou o servidor, em vez da tela de erro do navegador.
  await expect(page.getByRole('heading', { name: 'Não deu para carregar' })).toBeVisible();
  await expect(page.getByText(/Sem conexão com o servidor/)).toBeVisible();

  await context.setOffline(false);
  await page.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
  await context.close();
});

test('o servidor entrega o app em qualquer rota e nunca cacheia o service worker', async ({
  request,
}) => {
  const deep = await request.get('/remedios/123');
  expect(deep.status()).toBe(200);
  expect(await deep.text()).toContain('<div id="root">');

  const worker = await request.get('/sw.js');
  expect(worker.status()).toBe(200);
  expect(worker.headers()['cache-control']).toBe('no-cache');
});

test('explica o estado dos lembretes neste aparelho', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('link', { name: 'Ajustes' }).click();
  await expect(page.getByRole('heading', { name: 'Lembretes neste aparelho' })).toBeVisible();
  await expect(page.getByTestId('push-estado')).not.toHaveText('Verificando…');
});

test('salva os ajustes de aviso', async ({ page }) => {
  await page.goto('/ajustes');
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await page.getByLabel('Avisar da validade com').fill('45');
  await page.getByLabel('Enviar avisos a partir das').fill('08:30');
  await page.getByRole('button', { name: 'Salvar avisos' }).click();
  await expect(page.getByRole('status')).toHaveText('Avisos salvos');

  await page.reload();
  await expect(page.getByLabel('Avisar da validade com')).toHaveValue('45');
  await expect(page.getByLabel('Enviar avisos a partir das')).toHaveValue('08:30');

  // Volta ao padrão para não mudar o que os outros testes consideram "vencendo".
  await page.getByLabel('Avisar da validade com').fill('30');
  await page.getByLabel('Enviar avisos a partir das').fill('09:00');
  await page.getByRole('button', { name: 'Salvar avisos' }).click();
  await expect(page.getByRole('status')).toHaveText('Avisos salvos');
});
