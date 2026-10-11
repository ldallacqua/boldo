// Tira as capturas de tela do README (docs/screenshots) de um Boldo em execução e já populado.
// Uso: ADMIN_PASSWORD=... node scripts/screenshots.mjs [http://localhost:3210]
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:3210';
const password = process.env.ADMIN_PASSWORD;
if (!password) throw new Error('Defina ADMIN_PASSWORD.');
const out = new URL('../docs/screenshots/', import.meta.url).pathname;
await mkdir(out, { recursive: true });

const sizes = {
  celular: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  desktop: { width: 1440, height: 900 },
};

const browser = await chromium.launch();
for (const [name, viewport] of Object.entries(sizes)) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    serviceWorkers: 'block',
    locale: 'pt-BR',
  });
  const page = await context.newPage();
  const shot = (file) => page.screenshot({ path: `${out}${name}-${file}.png` });

  await page.goto(base);
  await page.getByLabel('Senha').waitFor();
  await page.evaluate(() => document.fonts.ready);
  if (name === 'desktop') await shot('entrada');
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('heading', { name: 'Doses de hoje' }).waitFor();
  await shot('hoje');

  await page.goto(`${base}/remedios`);
  await page.getByRole('heading', { name: 'Remédios' }).waitFor();
  await shot('remedios');

  await page.getByRole('link', { name: /Losartana/ }).click();
  await page.getByRole('dialog').waitFor();
  await page.waitForTimeout(400);
  await shot('detalhe');
  await context.close();
}
await browser.close();
console.log(`Capturas em ${out}`);
