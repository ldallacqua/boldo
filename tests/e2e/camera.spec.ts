import { expect, test } from '@playwright/test';
import { expectAlergaliv, login } from './helpers';

/**
 * Roda só no projeto "camera", em que o Chromium entrega o vídeo de fixtures/camera.mjpeg no
 * lugar da câmera. Cobre o caminho inteiro: abrir a câmera, ler o código no vídeo, procurar
 * na lista e preencher. Não cobre uma câmera de verdade apontada para uma caixa de verdade.
 */
test('com a câmera, lê o código sozinho e preenche o formulário', async ({ page }) => {
  await login(page);
  await page.goto('/remedios/novo');
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Ler código de barras' }).click();
  await expectAlergaliv(sheet);
  // Depois de achar, o leitor fecha e a câmera é desligada.
  await expect(sheet.getByRole('region', { name: 'Leitor de código de barras' })).toHaveCount(0);
});
