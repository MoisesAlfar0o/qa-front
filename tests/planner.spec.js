import { expect, test } from '@playwright/test';

const project = {
  id: 'demo-web',
  name: 'Proyecto Demo',
  baseUrl: 'http://127.0.0.1:4173',
  startPath: '/lab',
  environment: 'test',
  auth: { mode: 'none' },
};

test.describe('Planner de la plataforma BDD', () => {
  test('crea un proyecto desde la interfaz existente y muestra el estado real de Ollama', async ({ page }) => {
    let savedProject = null;
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === '/api/planner/status') {
        await route.fulfill({ json: { connected: false, model: 'qwen2.5:3b', modelAvailable: false, message: 'Ollama no responde.', provider: 'ollama' } });
      } else if (url.pathname === '/api/projects' && request.method() === 'GET') {
        await route.fulfill({ json: { projects: savedProject ? [savedProject] : [] } });
      } else if (url.pathname === '/api/projects' && request.method() === 'POST') {
        savedProject = { ...project, ...request.postDataJSON(), id: project.id };
        await route.fulfill({ status: 201, json: { project: savedProject } });
      } else if (url.pathname === `/api/projects/${project.id}`) {
        await route.fulfill({ json: { project: savedProject, exploring: false, inventory: null, navigation: null } });
      } else if (url.pathname === `/api/projects/${project.id}/scenarios`) {
        await route.fulfill({ json: { scenarios: [] } });
      } else if (url.pathname === `/api/projects/${project.id}/runs`) {
        await route.fulfill({ json: { runs: [] } });
      } else {
        await route.fulfill({ status: 404, json: { error: `Ruta de prueba no esperada: ${url.pathname}` } });
      }
    });

    await page.goto('/planner');
    await expect(page.getByText('Configura tu primer proyecto')).toBeVisible();
    await expect(page.getByText(/Ollama no está listo/)).toBeVisible();
    await page.getByRole('button', { name: /Crear proyecto/ }).click();
    await page.getByLabel('Nombre del proyecto').fill('Proyecto Demo');
    await page.getByLabel('URL de inicio').fill('http://127.0.0.1:4173/lab');
    await page.getByRole('button', { name: 'Crear proyecto', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Proyecto Demo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Explorar aplicación' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generar plan' })).toBeDisabled();
  });

  test('muestra inventario, limitaciones MCP y mapa devueltos por el backend', async ({ page }) => {
    const inventory = {
      exploredAt: '2026-10-23T15:00:00.000Z',
      pages: [{ path: '/lab' }, { path: '/lab/catalogos/productos' }],
      elementCount: 12,
      tableCount: 1,
      warnings: ['La navegación MCP no estuvo disponible.'],
      mcp: { used: false, reason: 'Servidor MCP desconectado.', pagesSnapshotted: 0 },
    };
    const details = {
      project,
      exploring: false,
      inventory,
      navigation: { nodes: [{ id: 'lab', path: ['Laboratorio'], route: '/lab' }] },
    };

    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/planner/status') {
        await route.fulfill({ json: { connected: true, model: 'qwen2.5:3b', modelAvailable: true, provider: 'ollama' } });
      } else if (url.pathname === '/api/projects') {
        await route.fulfill({ json: { projects: [project] } });
      } else if (url.pathname === `/api/projects/${project.id}` || url.pathname === `/api/projects/${project.id}/explore`) {
        await route.fulfill({ json: details });
      } else if (url.pathname === `/api/projects/${project.id}/scenarios`) {
        await route.fulfill({ json: { scenarios: [] } });
      } else if (url.pathname === `/api/projects/${project.id}/runs`) {
        await route.fulfill({ json: { runs: [] } });
      } else {
        await route.fulfill({ status: 404, json: { error: `Ruta de prueba no esperada: ${url.pathname}` } });
      }
    });

    await page.goto('/planner');
    await expect(page.getByText('2 páginas')).toBeVisible();
    await expect(page.getByText(/MCP no utilizado: Servidor MCP desconectado/)).toBeVisible();
    await page.getByText('Mapa de navegación (1 nodos)').click();
    await expect(page.getByText('Laboratorio — /lab')).toBeVisible();
    await page.getByRole('button', { name: 'Actualizar exploración' }).click();
    await expect(page.getByText(/Exploración guardada: 2 páginas. MCP no utilizado/)).toBeVisible();
  });
});
