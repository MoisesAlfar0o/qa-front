import { expect, test } from '@playwright/test';

test.describe('Lista de tareas de demostración', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/sample');
  });

  test('agrega una tarea a la lista', async ({ page }) => {
    await page.getByLabel('Nueva tarea').fill('Revisar el reporte de QA');
    await page.getByRole('button', { name: 'Agregar tarea' }).click();

    await expect(page.getByRole('listitem')).toContainText('Revisar el reporte de QA');
    await expect(page.getByText('1 tarea pendiente')).toBeVisible();
  });

  test('no permite agregar una tarea vacía', async ({ page }) => {
    await page.getByRole('button', { name: 'Agregar tarea' }).click();

    await expect(page.getByRole('alert')).toHaveText('Escribe una tarea antes de agregarla.');
    await expect(page.getByRole('listitem')).toHaveCount(0);
  });

  test('marca una tarea como completada', async ({ page }) => {
    await page.getByLabel('Nueva tarea').fill('Validar inicio de sesión');
    await page.getByRole('button', { name: 'Agregar tarea' }).click();
    await page.getByRole('checkbox', { name: 'Completar Validar inicio de sesión' }).check();

    await expect(page.getByRole('listitem')).toHaveClass(/completed/);
    await expect(page.getByText('¡Todo listo!')).toBeVisible();
  });
});
