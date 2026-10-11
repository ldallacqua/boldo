import { expect, test } from '@playwright/test';
import { createMedicine, login, unique } from './helpers';

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('a navegação fica embaixo no celular e na lateral em telas largas', async ({ page }) => {
  const viewport = page.viewportSize()!;
  const nav = await page.getByRole('navigation', { name: 'Principal' }).boundingBox();
  expect(nav).not.toBeNull();

  if (viewport.width < 720) {
    expect(nav!.width).toBe(viewport.width);
    expect(nav!.y + nav!.height).toBe(viewport.height);
    expect(nav!.y).toBeGreaterThan(viewport.height / 2);
  } else {
    expect(nav!.x).toBe(0);
    expect(nav!.y).toBe(0);
    expect(nav!.height).toBe(viewport.height);
    expect(nav!.width).toBeLessThan(viewport.width / 3);
  }
});

test('nenhuma tela rola para os lados', async ({ page }, info) => {
  const medicine = await createMedicine(page, {
    name: unique(info, 'Nome bem comprido de remédio para testar a quebra de linha'),
    dosage: '1.000 mg/mL',
    purpose: 'Uma descrição longa de para que serve, que não pode empurrar a tela para o lado',
    quantity: 1234.5,
    unit: 'aplicacao',
    lowThreshold: 2000,
    expiresOn: '2020-01',
    notes: 'umapalavraenormesemnenhumespaçoquepoderiaestourarolayoutseonãohouvessequebra'.repeat(3),
    schedules: [
      { time: '08:00', days: [0, 1, 2, 3, 4, 5, 6], dose: 1 },
      { time: '20:00', days: [0, 1, 2, 3, 4, 5, 6], dose: 1 },
    ],
  });

  const paths = ['/', '/remedios', `/remedios/${medicine.id}`, `/remedios/${medicine.id}/editar`];
  for (const path of [...paths, '/remedios/novo', '/ajustes']) {
    await page.goto(path);
    await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      const panel = document.querySelector('.sheet-body');
      return {
        page: doc.scrollWidth - doc.clientWidth,
        panel: panel ? panel.scrollWidth - panel.clientWidth : 0,
      };
    });
    expect(overflow, path).toEqual({ page: 0, panel: 0 });
  }
});

test('os alvos de toque principais têm pelo menos 44px', async ({ page }, info) => {
  const medicine = await createMedicine(page, { name: unique(info, 'Toque'), quantity: 3 });
  await page.goto(`/remedios/${medicine.id}`);
  const sheet = page.getByRole('dialog');
  const targets = [
    sheet.getByRole('button', { name: 'Pôr 1' }),
    sheet.getByRole('button', { name: 'Tirar 1' }),
    sheet.getByRole('button', { name: 'Fechar' }),
    sheet.getByRole('link', { name: 'Editar' }),
  ];
  for (const target of targets) {
    const box = (await target.boundingBox())!;
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
  }
});

test('no formulário, nenhum campo invade o vizinho', async ({ page }, info) => {
  const medicine = await createMedicine(page, {
    name: unique(info, 'Campos'),
    dosage: '1.200.000 UI/mL',
    unit: 'aplicacao',
    quantity: 1234.5,
    lowThreshold: 2000,
    expiresOn: '2030-12',
    schedules: [
      { time: '08:00', days: [0, 1, 2, 3, 4, 5, 6], dose: 1 },
      { time: '23:59', days: [1, 3, 5], dose: 12.5 },
    ],
  });
  await page.goto(`/remedios/${medicine.id}/editar`);
  await expect(page.getByLabel('Horário 2', { exact: true })).toBeVisible();

  const findProblems = () =>
    page.evaluate(async () => {
      // O painel entra deslizando; medir no meio do caminho dá posições que não valem.
      await Promise.all(document.getAnimations().map((animation) => animation.finished));
      const form = document.querySelector('form.formulario')!;
      const bounds = form.getBoundingClientRect();
      const label = (el: Element) =>
        el.getAttribute('aria-label') || el.id || el.textContent?.trim().slice(0, 20) || el.tagName;
      const parts = [
        ...form.querySelectorAll('input, select, textarea, button, .campo-sufixo span'),
      ]
        // A barra de Salvar fica grudada no rodapé e passa por cima de propósito.
        .filter((el) => !el.closest('.acoes-fixas'))
        .map((el) => ({ name: label(el), tag: el.tagName, box: el.getBoundingClientRect() }));

      const found: string[] = [];
      for (const [index, a] of parts.entries()) {
        if (a.box.left < bounds.left - 0.5 || a.box.right > bounds.right + 0.5) {
          found.push(`"${a.name}" sai do formulário`);
        }
        if (a.tag !== 'SPAN' && a.box.width < 40) {
          found.push(`"${a.name}" ficou com ${Math.round(a.box.width)}px de largura`);
        }
        for (const b of parts.slice(index + 1)) {
          const x = Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left);
          const y = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top);
          if (x > 0.5 && y > 0.5) found.push(`"${a.name}" invade "${b.name}"`);
        }
      }
      return found;
    });

  expect(await findProblems(), 'no tamanho do aparelho').toEqual([]);

  // O celular mais estreito ainda em uso (iPhone SE de 1ª geração, Androids pequenos).
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await findProblems(), 'com 320px de largura').toEqual([]);
});
