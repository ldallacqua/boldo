import { expect, test } from '@playwright/test';
import { createMedicine, login, row, unique } from './helpers';

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('cadastra um remédio completo e mostra na lista e nos detalhes', async ({ page }, info) => {
  const name = unique(info, 'Dipirona');
  const year = String(new Date().getFullYear() + 2);

  await page.goto('/remedios');
  await page.getByRole('link', { name: 'Adicionar remédio' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Novo remédio' })).toBeVisible();

  await sheet.getByLabel('Nome', { exact: true }).fill(name);
  await sheet.getByLabel('Valor da dosagem').fill('0.5');
  await sheet.getByLabel('Medida da dosagem').selectOption('g');
  // Tags: uma sugestão com um toque, uma escrita com Enter e uma separada por vírgula.
  const tagField = sheet.getByLabel('Pra que serve');
  await sheet.getByRole('button', { name: 'Febre', exact: true }).click();
  await tagField.fill('dor');
  await tagField.press('Enter');
  await tagField.fill('uso da vovó, sobra');
  await expect(sheet.getByRole('button', { name: 'Remover Uso da vovó' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Remover Febre' }).click();
  // "sobra" ficou digitado sem Enter: entra como tag ao salvar.
  await sheet.getByLabel('Quantidade em casa').fill('20');
  await sheet.getByLabel('Unidade', { exact: true }).selectOption('capsula');
  await sheet.getByLabel('Avisar quando restar').fill('5');
  await sheet.getByLabel('Mês da validade').selectOption('08');
  await sheet.getByLabel('Ano da validade').selectOption(year);
  await sheet.getByLabel('Anotações').fill('Gaveta do banheiro.\nTomar depois de comer.');
  await sheet.getByRole('button', { name: 'Salvar remédio' }).click();

  await expect(page.getByRole('status')).toHaveText('Remédio salvo');
  await expect(sheet.getByRole('heading', { name })).toBeVisible();
  await expect(sheet).toContainText('0,5 g');
  await expect(sheet.getByRole('list', { name: 'Pra que serve' }).getByRole('listitem')).toHaveText(
    ['Dor', 'Uso da vovó', 'Sobra'],
  );
  await expect(sheet.getByTestId('quantidade')).toHaveText('20');
  await expect(sheet).toContainText('cápsulas em casa');
  await expect(sheet).toContainText('Avisa quando restarem 5 cápsulas');
  await expect(sheet).toContainText(`08/${year}`);
  await expect(sheet).toContainText('Tomar depois de comer.');

  await sheet.getByRole('button', { name: 'Fechar' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(row(page, name)).toContainText('Dor, Uso da vovó, Sobra');
  await expect(row(page, name)).toContainText('20');
  await expect(row(page, name)).toContainText(`Validade 08/${year}`);
});

test('não salva sem nome e diz o que falta', async ({ page }) => {
  await page.goto('/remedios/novo');
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Quantidade em casa').fill('3');
  await sheet.getByRole('button', { name: 'Salvar remédio' }).click();
  await expect(sheet.getByRole('alert')).toHaveText('Informe o nome do remédio.');

  await sheet.getByLabel('Nome', { exact: true }).fill('Sem dosagem válida');
  await sheet.getByLabel('Valor da dosagem').fill('0');
  await sheet.getByRole('button', { name: 'Salvar remédio' }).click();
  await expect(sheet.getByRole('alert')).toContainText('Dosagem inválida');
  await expect(page).toHaveURL(/\/remedios\/novo$/);
});

test('ajusta a quantidade com os botões de mais e menos', async ({ page }, info) => {
  const medicine = await createMedicine(page, {
    name: unique(info, 'Ibuprofeno'),
    quantity: 2,
    lowThreshold: 1,
  });
  await page.goto(`/remedios/${medicine.id}`);
  const sheet = page.getByRole('dialog');
  const quantity = sheet.getByTestId('quantidade');

  await sheet.getByRole('button', { name: 'Pôr 1' }).click();
  await expect(quantity).toHaveText('3');

  await sheet.getByRole('button', { name: 'Tirar 1' }).click();
  await sheet.getByRole('button', { name: 'Tirar 1' }).click();
  await expect(quantity).toHaveText('1');
  await expect(sheet.getByText('Acabando', { exact: true })).toBeVisible();

  await sheet.getByRole('button', { name: 'Tirar 1' }).click();
  await expect(quantity).toHaveText('0');
  await expect(sheet.getByText('Acabou', { exact: true })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Tirar 1' })).toBeDisabled();

  // O número ficou gravado no servidor, não só na tela.
  await page.reload();
  await expect(page.getByRole('dialog').getByTestId('quantidade')).toHaveText('0');
});

test('edita um remédio, incluindo os horários', async ({ page }, info) => {
  const medicine = await createMedicine(page, {
    name: unique(info, 'Omeprazol'),
    dosage: '2.000 UI',
    quantity: 14,
  });
  const renamed = `${medicine.name} editado`;

  await page.goto(`/remedios/${medicine.id}`);
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('Sem lembrete de horário');
  await sheet.getByRole('link', { name: 'Editar' }).click();

  // A dosagem guardada volta separada em número e medida.
  await expect(sheet.getByLabel('Valor da dosagem')).toHaveValue('2000');
  await expect(sheet.getByLabel('Medida da dosagem')).toHaveValue('UI');
  await sheet.getByLabel('Valor da dosagem').fill('20');
  await sheet.getByLabel('Medida da dosagem').selectOption('mg/mL');

  await sheet.getByLabel('Nome', { exact: true }).fill(renamed);
  await sheet.getByLabel('Anotações').fill('Em jejum.');
  await sheet.getByRole('button', { name: 'Adicionar horário' }).click();
  await sheet.getByLabel('Horário 1', { exact: true }).fill('07:15');
  await sheet.getByLabel('Dose do horário 1').fill('2');
  // Tira sábado e domingo.
  const days = sheet.getByRole('group', { name: 'Dias do horário 1' });
  await days.getByRole('button', { name: 'sábado' }).click();
  await days.getByRole('button', { name: 'domingo' }).click();
  await sheet.getByRole('button', { name: 'Salvar remédio' }).click();

  await expect(sheet.getByRole('heading', { name: renamed })).toBeVisible();
  await expect(sheet).toContainText('20 mg/mL');
  await expect(sheet).toContainText('Em jejum.');
  await expect(sheet).toContainText('07:15');
  await expect(sheet).toContainText('2 comprimidos, seg a sex');
  await expect(sheet).toContainText('Dá para 9 dias');
});

test('exclui só depois de confirmar', async ({ page }, info) => {
  const medicine = await createMedicine(page, { name: unique(info, 'Loratadina') });
  await page.goto(`/remedios/${medicine.id}`);
  const sheet = page.getByRole('dialog');

  await sheet.getByRole('button', { name: 'Excluir', exact: true }).click();
  await sheet.getByRole('button', { name: 'Cancelar' }).click();
  await expect(sheet.getByRole('link', { name: 'Editar' })).toBeVisible();

  await sheet.getByRole('button', { name: 'Excluir', exact: true }).click();
  await sheet.getByRole('button', { name: 'Excluir remédio' }).click();
  await expect(page.getByRole('status')).toHaveText('Remédio excluído');
  await expect(page).toHaveURL(/\/remedios$/);
  await expect(row(page, medicine.name)).toHaveCount(0);
});

test('busca por nome ou por tag, ignorando acentos', async ({ page }, info) => {
  const tag = unique(info, 'zzbusca').replace(/ /g, '');
  const cough = await createMedicine(page, { name: `Xarope ${tag}`, tags: ['Tosse'] });
  const allergy = await createMedicine(page, { name: `Antialérgico ${tag}`, tags: ['Rinite'] });

  await page.goto('/remedios');
  const search = page.getByRole('searchbox', { name: 'Buscar remédio' });

  await search.fill(tag);
  await expect(row(page, cough.name)).toBeVisible();
  await expect(row(page, allergy.name)).toBeVisible();

  await search.fill(`antialergico ${tag}`);
  await expect(row(page, allergy.name)).toBeVisible();
  await expect(row(page, cough.name)).toHaveCount(0);

  await search.fill(`rinite`);
  await expect(row(page, allergy.name)).toBeVisible();
  await expect(row(page, cough.name)).toHaveCount(0);

  await search.fill('nada-com-esse-nome');
  await expect(page.getByText('Nenhum remédio com esses critérios.')).toBeVisible();
  await page.getByRole('button', { name: 'Mostrar todos' }).click();
  await expect(row(page, cough.name)).toBeVisible();
});

test('filtra por tag e oferece as tags já usadas no formulário', async ({ page }, info) => {
  const tag = unique(info, 'Tag').replace(/ /g, '');
  const withTag = await createMedicine(page, { name: unique(info, 'Com tag'), tags: [tag] });
  const without = await createMedicine(page, { name: unique(info, 'Sem tag') });

  await page.goto('/remedios');
  const tagFilter = page
    .getByRole('group', { name: 'Filtrar por tag' })
    .getByRole('button', { name: tag });
  await expect(tagFilter).toContainText('1');
  await tagFilter.click();
  await expect(row(page, withTag.name)).toBeVisible();
  await expect(row(page, without.name)).toHaveCount(0);

  await tagFilter.click();
  await expect(row(page, without.name)).toBeVisible();

  // A tag criada em um remédio vira sugestão nos outros.
  await page.goto(`/remedios/${without.id}/editar`);
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Pra que serve').fill(tag.slice(0, 12));
  await sheet.getByRole('button', { name: tag, exact: true }).click();
  await sheet.getByRole('button', { name: 'Salvar remédio' }).click();
  await expect(sheet.getByRole('list', { name: 'Pra que serve' })).toContainText(tag);
});

test('filtra os que estão acabando e os que estão vencendo', async ({ page }, info) => {
  const low = await createMedicine(page, {
    name: unique(info, 'Pouco'),
    quantity: 2,
    lowThreshold: 5,
  });
  const expired = await createMedicine(page, { name: unique(info, 'Velho'), expiresOn: '2020-01' });
  const fine = await createMedicine(page, { name: unique(info, 'Normal'), quantity: 50 });

  await page.goto('/remedios');
  await expect(row(page, low.name)).toContainText('Acabando');
  await expect(row(page, expired.name)).toContainText('Vencido');

  const filters = page.getByRole('group', { name: 'Filtrar remédios' });
  await filters.getByRole('button', { name: /Acabando/ }).click();
  await expect(row(page, low.name)).toBeVisible();
  await expect(row(page, expired.name)).toHaveCount(0);
  await expect(row(page, fine.name)).toHaveCount(0);

  await filters.getByRole('button', { name: /Vencendo/ }).click();
  await expect(row(page, expired.name)).toBeVisible();
  await expect(row(page, low.name)).toHaveCount(0);

  await filters.getByRole('button', { name: /Todos/ }).click();
  await expect(row(page, fine.name)).toBeVisible();
});

test('abrir um remédio que não existe explica o que houve', async ({ page }) => {
  await page.goto('/remedios/999999');
  await expect(page.getByRole('dialog')).toContainText('Remédio não encontrado');
});

test('no celular, arrastar o painel para baixo fecha; um puxão curto não', async ({
  page,
}, info) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 720, 'Só o painel do celular é arrastável.');
  const medicine = await createMedicine(page, { name: unique(info, 'Arrasta') });
  await page.goto(`/remedios/${medicine.id}`);
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('link', { name: 'Editar' })).toBeVisible();
  // O painel ainda está subindo: só depois de pousar o título está onde o dedo vai tocar.
  await page.evaluate(() =>
    Promise.all(
      (document.querySelector('.sheet-panel')?.getAnimations() ?? [])
        .filter((animation) => animation.timeline === document.timeline)
        .map((animation) => animation.finished),
    ),
  );
  const title = (await sheet.getByRole('heading', { name: medicine.name }).boundingBox())!;
  const x = title.x + title.width / 2;
  const y = title.y + title.height / 2;
  const pull = async (distance: number) => {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + distance / 2, { steps: 5 });
    await page.mouse.move(x, y + distance, { steps: 5 });
    // Parado um instante antes de soltar: fecha pela distância, não pela velocidade.
    await page.waitForTimeout(120);
    await page.mouse.move(x, y + distance);
    await page.mouse.up();
  };

  await pull(40);
  await expect(sheet.getByRole('link', { name: 'Editar' })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/remedios/${medicine.id}$`));

  await pull(260);
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(/\/remedios$/);
});

test('com movimento reduzido no sistema, o painel abre e fecha sem animação', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const medicine = await createMedicine(page, { name: unique(info, 'Calmo') });
  await page.goto('/remedios');
  await row(page, medicine.name).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('link', { name: 'Editar' })).toBeVisible();
  // Nada fica se mexendo no relógio da página (o fio do cabeçalho segue a rolagem, não o tempo).
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter(
              (animation) =>
                animation.timeline === document.timeline && animation.playState === 'running',
            ).length,
      ),
    )
    .toBe(0);
  await sheet.getByRole('button', { name: 'Fechar' }).click();
  await expect(sheet).toHaveCount(0);
});

test('fechar o formulário com edição por salvar pergunta antes de descartar', async ({
  page,
}, info) => {
  const medicine = await createMedicine(page, { name: unique(info, 'Rascunho') });
  await page.goto(`/remedios/${medicine.id}/editar`);
  const sheet = page.getByRole('dialog');
  const question = sheet.getByRole('alertdialog');

  // Sem mexer em nada, fecha direto.
  await sheet.getByRole('button', { name: 'Voltar' }).click();
  await expect(sheet.getByRole('link', { name: 'Editar' })).toBeVisible();

  await sheet.getByRole('link', { name: 'Editar' }).click();
  await sheet.getByLabel('Anotações').fill('Tomar com água');
  await sheet.getByRole('button', { name: 'Fechar' }).click();
  await expect(question).toContainText('Descartar o que você mudou');
  await question.getByRole('button', { name: 'Continuar editando' }).click();
  await expect(sheet.getByLabel('Anotações')).toHaveValue('Tomar com água');

  await sheet.getByRole('button', { name: 'Cancelar' }).click();
  await question.getByRole('button', { name: 'Descartar' }).click();
  await expect(sheet.getByRole('link', { name: 'Editar' })).toBeVisible();
  await expect(sheet).toContainText('Nenhuma anotação');

  // Salvar não é descartar: não pergunta nada.
  await sheet.getByRole('link', { name: 'Editar' }).click();
  await sheet.getByLabel('Anotações').fill('Tomar com água');
  await sheet.getByRole('button', { name: 'Salvar remédio' }).click();
  await expect(sheet).toContainText('Tomar com água');
  await sheet.getByRole('button', { name: 'Fechar' }).click();
  await expect(sheet).toHaveCount(0);
});

test('cada horário novo sugere uma hora diferente', async ({ page }) => {
  await page.goto('/remedios/novo');
  const sheet = page.getByRole('dialog');
  const add = sheet.getByRole('button', { name: 'Adicionar horário' });
  await add.click();
  await add.click();
  await add.click();
  await expect(sheet.getByLabel('Horário 1', { exact: true })).toHaveValue('08:00');
  await expect(sheet.getByLabel('Horário 2', { exact: true })).toHaveValue('20:00');
  await expect(sheet.getByLabel('Horário 3', { exact: true })).toHaveValue('14:00');
});

test('o painel entra deslizando, do lado de fora até o lugar', async ({ page }, info) => {
  const medicine = await createMedicine(page, { name: unique(info, 'Desliza') });
  await page.goto('/remedios');
  await expect(row(page, medicine.name)).toBeVisible();
  const wide = (page.viewportSize()?.width ?? 0) >= 720;

  // Um observador dentro da página anota, quadro a quadro, onde o painel esteve e quanto o
  // <dialog> rolou. Medir daqui de fora dependeria da pressa do teste: em máquina lenta a
  // primeira medida já chegaria com a entrada terminada.
  await page.evaluate((horizontal) => {
    const seen = { farthest: -Infinity, scrolled: 0 };
    (window as unknown as { entrance: typeof seen }).entrance = seen;
    const measure = () => {
      const panel = document.querySelector('.sheet-panel');
      const dialog = document.querySelector('.sheet');
      if (!panel || !dialog) return;
      const box = panel.getBoundingClientRect();
      seen.farthest = Math.max(seen.farthest, horizontal ? box.left : box.top);
      seen.scrolled = Math.max(seen.scrolled, dialog.scrollLeft + dialog.scrollTop);
    };
    const everyFrame = () => {
      measure();
      requestAnimationFrame(everyFrame);
    };
    requestAnimationFrame(everyFrame);
    // E também assim que o painel entra no DOM, sem esperar o próximo quadro.
    new MutationObserver(measure).observe(document.body, { childList: true, subtree: true });
  }, wide);
  const entrance = () =>
    page.evaluate(() => {
      const seen = (window as unknown as { entrance: { farthest: number; scrolled: number } })
        .entrance;
      const result = { ...seen };
      seen.farthest = -Infinity;
      seen.scrolled = 0;
      return result;
    });
  const settledEdge = () =>
    page.evaluate(async (horizontal) => {
      const panel = document.querySelector('.sheet-panel')!;
      await Promise.all(
        panel
          .getAnimations()
          .filter((animation) => animation.timeline === document.timeline)
          .map((animation) => animation.finished),
      );
      const box = panel.getBoundingClientRect();
      return horizontal ? box.left : box.top;
    }, wide);

  for (const open of [
    () => row(page, medicine.name).click(),
    // O formulário novo põe o cursor no nome: o foco não pode puxar o painel para dentro.
    () => page.getByRole('link', { name: 'Adicionar remédio' }).click(),
  ]) {
    await entrance();
    await open();
    await expect(page.getByRole('dialog')).toBeVisible();
    const settled = await settledEdge();
    const seen = await entrance();
    // Esteve bem mais para fora do que terminou, e o <dialog> nunca rolou para "ajudar".
    expect(seen.farthest).toBeGreaterThan(settled + 100);
    expect(seen.scrolled).toBe(0);
    await page.getByRole('dialog').getByRole('button', { name: 'Fechar' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
});
