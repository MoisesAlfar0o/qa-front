import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';

import express from 'express';
import { expect, test } from '@playwright/test';

import { createApiRouter } from '../../platform/api.ts';
import { createPlatform } from '../../platform/services.ts';
import type { PlannerProvider } from '../../platform/planner.ts';

test.describe('Flujo integrado de la plataforma', () => {
  test.setTimeout(180_000);

  let workspace = '';
  let apiServer: Server;
  let apiBase = '';
  let platform: ReturnType<typeof createPlatform>;

  test.beforeAll(async () => {
    workspace = await mkdtemp(path.join(tmpdir(), 'qa-front-platform-e2e-'));
    const provider: PlannerProvider = {
      name: 'integration-fixture',
      model: 'controlled-plan',
      async complete(messages) {
        const prompt = messages.find((message) => message.role === 'user')?.content ?? '';
        const find = (pattern: RegExp, label: string) => {
          const match = prompt.match(pattern);
          if (!match) throw new Error(`La exploración real no incluyó ${label} en el contexto del planner.`);
          return match;
        };
        const search = find(/^(E\d+) \| (?:textbox|searchbox) "Buscar por nombre"/m, 'el campo de búsqueda');
        const rowAction = find(/^\s*(T\d+C\d+) \| row control: button "Editar"/m, 'el control de edición de fila');
        const name = find(/^(E\d+) \| textbox "Nombre"/m, 'el campo Nombre del formulario');
        const save = find(/^(E\d+) \| button "Guardar"/m, 'el botón Guardar del formulario');
        return {
          content: JSON.stringify({
            status: 'ready',
            title: 'Actualizar y verificar el nombre de un producto',
            objective: 'Buscar un producto, actualizar su nombre y comprobar el cambio.',
            destination: ['Catálogos', 'Productos'],
            actions: [
              { action: 'fill', element: search[1], target: 'campo de búsqueda Buscar por nombre', value: 'Moisés', row: [] },
              { action: 'row_action', element: rowAction[1], target: 'botón Editar', value: '', row: [{ column: 'Nombre', value: 'Moisés' }] },
              { action: 'fill', element: name[1], target: 'campo Nombre', value: 'Rolando', row: [] },
              { action: 'click', element: save[1], target: 'botón Guardar', value: '', row: [] },
            ],
            assertions: [{ action: 'expect_row', element: '', target: '', value: '', row: [{ column: 'Nombre', value: 'Rolando' }] }],
            questions: [],
            missing: [],
          }),
        };
      },
    };
    platform = createPlatform(
      {
        ...process.env,
        QA_WORKSPACE: workspace,
        QA_ALLOWED_HOSTS: '127.0.0.1',
        QA_MCP_ENABLED: '0',
      },
      { provider },
    );

    const app = express();
    app.use('/api', createApiRouter(platform));
    apiServer = await new Promise<Server>((resolve) => {
      const server = app.listen(0, '127.0.0.1', () => resolve(server));
    });
    const address = apiServer.address();
    if (!address || typeof address === 'string') throw new Error('No se pudo iniciar la API de integración.');
    apiBase = `http://127.0.0.1:${address.port}/api`;
  });

  test.afterAll(async () => {
    await platform?.runs.shutdown();
    if (apiServer?.listening) await new Promise<void>((resolve, reject) => apiServer.close((error) => error ? reject(error) : resolve()));
    if (workspace) await rm(workspace, { recursive: true, force: true });
  });

  test('explora, planifica, aprueba, ejecuta Cucumber/Playwright y transmite eventos reales', async () => {
    const request = async (route: string, method = 'GET', body?: unknown) => {
      const response = await fetch(`${apiBase}${route}`, {
        method,
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { response, data: await response.json() as Record<string, any> };
    };

    const created = await request('/projects', 'POST', {
      name: 'Proyecto integrado',
      url: `${process.env.PORT ? `http://127.0.0.1:${process.env.PORT}` : 'http://127.0.0.1:4173'}/lab`,
      environment: 'test',
      authMode: 'none',
    });
    expect(created.response.status).toBe(201);
    const projectId = created.data.project.id as string;

    const explored = await request(`/projects/${projectId}/explore`, 'POST', {});
    expect(explored.response.status).toBe(200);
    expect(explored.data.inventory.pages.some((page: { path: string }) => page.path === '/lab/catalogos/productos')).toBe(true);

    const planned = await request(`/projects/${projectId}/plans`, 'POST', {
      input: { mode: 'free', text: 'En Catálogos, busca el producto cuyo Nombre es Moisés, edítalo, cambia el Nombre a Rolando, guarda y verifica que se haya actualizado.' },
    });
    expect(planned.response.status).toBe(201);
    expect(planned.data.plan.status).toBe('ready');
    expect(planned.data.plan.destination.route).toBe('/lab/catalogos/productos');
    expect(planned.data.plan.actions.map((action: { action: string }) => action.action)).toEqual(['open_module', 'fill', 'row_action', 'fill', 'click']);

    const createdScenario = await request(`/projects/${projectId}/scenarios`, 'POST', { planId: planned.data.planId });
    expect(createdScenario.response.status).toBe(201);
    const { manifest, version, text } = createdScenario.data;
    expect(version.validation.valid).toBe(true);
    expect(text).toContain('Característica: Actualizar y verificar el nombre de un producto');

    const approved = await request(`/projects/${projectId}/scenarios/${manifest.id}/versions/${version.version}/approve`, 'POST', {
      expectedHash: version.hash,
    });
    expect(approved.response.status).toBe(200);
    expect(approved.data.approval.dryRun.ok).toBe(true);

    const started = await request(`/projects/${projectId}/runs`, 'POST', {
      scenarioId: manifest.id,
      version: version.version,
      requestId: 'integration-run-0001',
    });
    expect(started.response.status).toBe(202);
    const runId = started.data.run.runId as string;

    const eventsResponse = await fetch(`${apiBase}/projects/${projectId}/runs/${runId}/events`, {
      signal: AbortSignal.timeout(150_000),
    });
    expect(eventsResponse.status).toBe(200);
    const eventStream = await eventsResponse.text();
    expect(eventStream).toContain('event: end');
    expect(eventStream).toContain('"type":"step.finished"');
    expect(eventStream).toContain('"type":"run.finished"');
    expect(eventStream).toContain('"status":"PASSED"');

    const finished = await request(`/projects/${projectId}/runs/${runId}`);
    expect(finished.data.run.status).toBe('PASSED');
    expect(finished.data.run.steps.length).toBeGreaterThan(0);
    const artifacts = finished.data.run.artifacts as Array<{ kind: string; file: string }>;
    expect(artifacts.map((artifact) => artifact.kind)).toEqual(expect.arrayContaining(['screenshot', 'trace', 'report', 'messages']));

    const history = await request(`/projects/${projectId}/runs`);
    expect(history.data.runs.some((run: { runId: string; status: string }) => run.runId === runId && run.status === 'PASSED')).toBe(true);

    const report = await fetch(`${apiBase}/projects/${projectId}/runs/${runId}/artifacts/report.html`);
    expect(report.status).toBe(200);
    expect(await report.text()).toContain('<html');
    for (const file of ['screenshots/step-01.jpg', 'traces/trace.zip', 'messages.ndjson']) {
      const artifact = await fetch(`${apiBase}/projects/${projectId}/runs/${runId}/artifacts/${file}`);
      expect(artifact.status, file).toBe(200);
    }
  });
});
