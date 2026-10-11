import { expect, test } from '@playwright/test';
import { api, createMedicine, login, unique } from './helpers';

test('o tema escuro vale para o aparelho e continua depois de recarregar', async ({ page }) => {
  await login(page);
  await page.goto('/ajustes');
  const html = page.locator('html');
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await expect(html).toHaveAttribute('data-theme', 'light');
  const light = await background();

  await page.getByRole('radio', { name: 'Escuro' }).check();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  expect(await background()).not.toBe(light);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#111814');

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('radio', { name: 'Escuro' })).toBeChecked();

  // Em "Como o aparelho", quem manda é o sistema.
  await page.getByRole('radio', { name: 'Como o aparelho' }).check();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(html).toHaveAttribute('data-theme', 'dark');
});

test('o texto continua legível no tema escuro', async ({ page }, info) => {
  await login(page);
  await createMedicine(page, { name: unique(info, 'Contraste'), tags: ['Dor'], quantity: 0 });
  await page.goto('/ajustes');
  await page.getByRole('radio', { name: 'Escuro' }).check();

  for (const path of ['/', '/remedios', '/remedios/novo', '/ajustes']) {
    await page.goto(path);
    await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
    // Contraste (WCAG) entre cada texto visível e o fundo sólido mais próximo atrás dele.
    const weak = await page.evaluate(async () => {
      await Promise.all(document.getAnimations().map((animation) => animation.finished));
      const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
      const luminance = ([r = 0, g = 0, b = 0]: number[]) => {
        const [x, y, z] = [r, g, b].map((v) => {
          const c = v / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * x! + 0.7152 * y! + 0.0722 * z!;
      };
      const backgroundOf = (start: Element): number[] => {
        for (let el: Element | null = start; el; el = el.parentElement) {
          const color = rgb(getComputedStyle(el).backgroundColor);
          if (color.length >= 3 && (color[3] ?? 1) > 0.9) return color;
        }
        return [255, 255, 255];
      };
      const found: string[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const text = walker.currentNode.textContent?.trim();
        const el = walker.currentNode.parentElement;
        if (!text || !el || !el.checkVisibility() || el.closest('.so-leitor, option')) continue;
        const a = luminance(rgb(getComputedStyle(el).color));
        const b = luminance(backgroundOf(el));
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        if (ratio < 4.5) found.push(`${ratio.toFixed(1)} "${text.slice(0, 30)}"`);
      }
      return [...new Set(found)];
    });
    expect(weak, path).toEqual([]);
  }
});

test('cada aparelho escolhe de quais remédios quer ser avisado', async ({ page }, info) => {
  // O navegador de teste não tem push de verdade: finge-se que este aparelho já está inscrito.
  const endpoint = `https://push.example/${unique(info, 'aparelho').replace(/ /g, '-')}`;
  await page.addInitScript((fakeEndpoint) => {
    const fake = { permission: 'granted', requestPermission: async () => 'granted' };
    Object.defineProperty(window, 'Notification', { value: fake, configurable: true });
    if (!('PushManager' in window)) Object.assign(window, { PushManager: class {} });
    // No iPhone o push só existe com o app instalado.
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    const registration = {
      pushManager: { getSubscription: async () => ({ endpoint: fakeEndpoint }) },
    };
    Object.defineProperty(navigator.serviceWorker, 'getRegistration', {
      value: async () => registration,
      configurable: true,
    });
  }, endpoint);

  await login(page);
  const mine = await createMedicine(page, { name: unique(info, 'Meu') });
  const hers = await createMedicine(page, { name: unique(info, 'Dela') });
  const client = await api(page);
  await client.post('/api/push/subscribe', { endpoint, keys: { p256dh: 'a', auth: 'b' } });
  const muted = async () =>
    (
      (await (await client.post('/api/push/device', { endpoint })).json()) as {
        mutedMedicines: number[];
      }
    ).mutedMedicines;

  await page.goto('/ajustes');
  const list = page.getByRole('group', { name: 'Avisar neste aparelho sobre' });
  await expect(list.getByLabel(mine.name)).toBeChecked();
  await list.getByLabel(hers.name).uncheck();
  await expect.poll(muted).toEqual([hers.id]);

  await page.reload();
  await expect(list.getByLabel(hers.name)).not.toBeChecked();
  await expect(list.getByLabel(mine.name)).toBeChecked();

  await list.getByLabel(hers.name).check();
  await expect.poll(muted).toEqual([]);
});
