import { expect, test } from '@playwright/test';

test.describe('Planner de historias de usuario', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/planner/status', (route) => route.fulfill({
      json: { connected: true, model: 'qwen2.5:3b', modelAvailable: true },
    }));
    await page.goto('/planner');
  });

  test('genera un plan revisable y lo ejecuta con Playwright real', async ({ page }) => {
    await page.route('**/api/planner/plan', (route) => route.fulfill({
      json: {
        model: 'qwen2.5:3b',
        steps: [
          { action: 'fill', locatorType: 'label', locator: 'Nueva tarea', value: 'Preparar caso de prueba' },
          { action: 'click', locatorType: 'role', locator: 'button', value: 'Agregar tarea' },
          { action: 'expect-visible', locatorType: 'text', locator: 'Preparar caso de prueba', value: '' },
          { action: 'expect-visible', locatorType: 'text', locator: '1 tarea pendiente', value: '' },
        ],
      },
    }));
    await expect(page.getByRole('button', { name: /Ejecutar plan/ })).toBeDisabled();
    await page.getByRole('button', { name: 'Generar plan con IA' }).click();

    await expect(page.getByText('5 pasos', { exact: true })).toBeVisible();
    await expect(page.getByText('Abrir la URL objetivo')).toBeVisible();
    await page.getByRole('button', { name: 'Aprobar plan' }).click();
    await page.getByRole('button', { name: /Ejecutar plan/ }).click();

    await expect(page.getByText('5/5 pasos')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('PASÓ', { exact: true })).toBeVisible();
    await expect(page.getByText('Ejecución Playwright finalizada.')).toBeVisible();
    await expect(page.locator('.real-browser-frame')).toBeVisible();
  });

  test('rechaza destinos fuera de localhost antes de llamar a Ollama', async ({ page }) => {
    await page.getByLabel('URL LOCAL AUTORIZADA').fill('https://example.com');
    await page.getByRole('button', { name: 'Generar plan con IA' }).click();
    await expect(page.getByText('Por ahora solo se permiten URLs locales: localhost, 127.0.0.1 o [::1].')).toBeVisible();
    await expect(page.getByText('No se encontró el plan del asistente.')).toHaveCount(0);
  });
});
