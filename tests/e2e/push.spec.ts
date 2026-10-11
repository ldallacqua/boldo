import { expect, test } from '@playwright/test';

/**
 * Confere, no service worker de produção, que um push vira a notificação certa.
 * O Chromium sem janela nega a permissão de notificação, então `showNotification` é trocado
 * por um espião. O envio servidor → serviço de push do navegador não é coberto aqui: depende
 * da internet e de um aparelho real (use "Enviar um teste" em Ajustes).
 */
test('o service worker transforma o push em notificação', async ({
  browser,
  baseURL,
  browserName,
}) => {
  // O Playwright só dá acesso ao service worker (para simular o push) no Chromium.
  test.skip(browserName !== 'chromium', 'Playwright só expõe service workers no Chromium');
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready);
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));

  const payload = {
    title: 'Hora de tomar Losartana',
    body: '1 comprimido (50 mg) às 08:00',
    tag: 'dose-7-2026-10-12',
    url: '/',
    dose: { scheduleId: 7, date: '2026-10-12', token: 'assinatura' },
  };

  const shown = await worker.evaluate(async (data) => {
    const scope = self as unknown as ServiceWorkerGlobalScope;
    const calls: unknown[][] = [];
    scope.registration.showNotification = async (...args: unknown[]) => {
      calls.push(args);
    };
    scope.dispatchEvent(new PushEvent('push', { data: JSON.stringify(data) }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    return calls;
  }, payload);

  expect(shown).toEqual([
    [
      payload.title,
      {
        body: payload.body,
        tag: payload.tag,
        icon: new URL('icons/icon-192.png', baseURL).href,
        badge: new URL('icons/badge-96.png', baseURL).href,
        lang: 'pt-BR',
        data: payload,
        actions: [{ action: 'take', title: 'Tomei' }],
      },
    ],
  ]);
  await context.close();
});
