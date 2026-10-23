import express, { type NextFunction, type Request, type Response } from 'express';
import { ZodError, z } from 'zod';

import { catalogSummary, CATALOG_VERSION } from './catalog.ts';
import { suggestStep } from './gherkin.ts';
import { PlannerError } from './planner.ts';
import { ConflictError, NotFoundError } from './projects.ts';
import { isTerminal, type RunEvent } from './run-events.ts';
import { BusyError } from './runs.ts';
import { ApprovalError } from './scenarios.ts';
import { redact, SecurityError } from './security.ts';
import type { Platform } from './services.ts';
import { AlreadyExistsError } from './store.ts';

type Handler = (req: Request, res: Response) => Promise<unknown>;

const wrap = (handler: Handler) => (req: Request, res: Response, next: NextFunction) => {
  handler(req, res).catch(next);
};

const param = (req: Request, name: string) => String(req.params[name] ?? '');

const PLANNER_STATUS: Record<string, number> = { OLLAMA_UNAVAILABLE: 503, MODEL_NOT_FOUND: 503, TIMEOUT: 504, INVALID_INPUT: 400 };

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({ error: 'Datos inválidos.', code: 'INVALID_INPUT', issues: error.issues.slice(0, 10).map((issue) => ({ path: issue.path.join('.'), message: issue.message })) });
    return;
  }
  if (error instanceof SecurityError) return void res.status(403).json({ error: error.message, code: 'FORBIDDEN' });
  if (error instanceof NotFoundError) return void res.status(404).json({ error: error.message, code: 'NOT_FOUND' });
  if (error instanceof ConflictError || error instanceof AlreadyExistsError) return void res.status(409).json({ error: error.message, code: 'CONFLICT' });
  if (error instanceof ApprovalError) return void res.status(422).json({ error: error.message, code: 'APPROVAL_REJECTED', details: error.details });
  if (error instanceof BusyError) return void res.status(429).json({ error: error.message, code: 'BUSY' });
  if (error instanceof PlannerError) return void res.status(PLANNER_STATUS[error.code] ?? 502).json({ error: error.message, code: error.code, attempts: error.attempts });
  if ((error as { type?: string }).type === 'entity.too.large') return void res.status(413).json({ error: 'La petición es demasiado grande.', code: 'TOO_LARGE' });
  if ((error as { type?: string }).type === 'entity.parse.failed') return void res.status(400).json({ error: 'JSON inválido.', code: 'INVALID_JSON' });
  console.error('[api]', redact((error as Error)?.stack ?? String(error)));
  res.status(500).json({ error: 'Error interno del servidor.', code: 'INTERNAL' });
}

const CreateScenarioBody = z.object({ planId: z.string() });
const CreateScenarioFromAnyBody = z.union([CreateScenarioBody, z.object({ text: z.string().min(1).max(50_000) })]);
const EditBody = z.object({ text: z.string().min(1).max(50_000), parentVersion: z.number().int().positive() });
const ApproveBody = z.object({ expectedHash: z.string().regex(/^[a-f0-9]{64}$/), authorizeRisk: z.boolean().optional() });
const ValidateBody = z.object({ text: z.string().max(50_000), planId: z.string().optional() });
const RunBody = z.object({ scenarioId: z.string(), version: z.number().int().positive(), requestId: z.string().optional(), headed: z.boolean().optional() });

export function createApiRouter(platform: Platform): express.Router {
  const { projects, scenarios, runs, plans, provider } = platform;
  const router = express.Router();
  router.use(express.json({ limit: '256kb' }));

  router.get('/planner/status', wrap(async (_req, res) => {
    const status = provider.status ? await provider.status() : { connected: true, model: provider.model, modelAvailable: true };
    res.json({ ...(status as object), provider: provider.name, mcpEnabled: platform.config.mcp.enabled, catalogVersion: CATALOG_VERSION });
  }));
  router.get('/catalog', (_req, res) => {
    res.json(catalogSummary());
  });

  router.get('/projects', wrap(async (_req, res) => res.json({ projects: await projects.list() })));
  router.post('/projects', wrap(async (req, res) => res.status(201).json({ project: await projects.create(req.body ?? {}) })));
  router.get('/projects/:pid', wrap(async (req, res) => res.json(await projects.details(param(req, 'pid')))));
  router.post('/projects/:pid/explore', wrap(async (req, res) => {
    const progress: string[] = [];
    await projects.explore(param(req, 'pid'), (message) => progress.push(redact(message)));
    res.json({ ...(await projects.details(param(req, 'pid'))), progress });
  }));
  router.get('/projects/:pid/inventory', wrap(async (req, res) => {
    await projects.get(param(req, 'pid'));
    res.json({ inventory: await projects.inventory(param(req, 'pid')) });
  }));

  router.post('/projects/:pid/plans', wrap(async (req, res) => res.status(201).json(await plans.create(param(req, 'pid'), req.body?.input ?? req.body))));
  router.get('/projects/:pid/plans/:planId', wrap(async (req, res) => res.json(await plans.get(param(req, 'pid'), param(req, 'planId')))));

  router.post('/projects/:pid/validate', wrap(async (req, res) => {
    const body = ValidateBody.parse(req.body);
    const plan = body.planId ? (await plans.get(param(req, 'pid'), body.planId)).plan : null;
    res.json({ validation: await scenarios.validate(param(req, 'pid'), body.text, plan) });
  }));
  router.post('/projects/:pid/suggest-step', wrap(async (req, res) => {
    const text = z.object({ text: z.string().max(500) }).parse(req.body).text;
    res.json({ suggestion: suggestStep(text) ?? null });
  }));

  router.get('/projects/:pid/scenarios', wrap(async (req, res) => res.json({ scenarios: await scenarios.list(param(req, 'pid')) })));
  router.post('/projects/:pid/scenarios', wrap(async (req, res) => {
    const body = CreateScenarioFromAnyBody.parse(req.body);
    if ('text' in body) return void res.status(201).json(await scenarios.createFromText(param(req, 'pid'), body.text));
    const stored = await plans.get(param(req, 'pid'), body.planId);
    res.status(201).json(await scenarios.createFromPlan(param(req, 'pid'), stored.plan, stored.plan.input));
  }));
  router.get('/projects/:pid/scenarios/:sid', wrap(async (req, res) => {
    const manifest = await scenarios.manifest(param(req, 'pid'), param(req, 'sid'));
    const latest = await scenarios.version(param(req, 'pid'), param(req, 'sid'), manifest.latestVersion);
    res.json({ manifest, latest });
  }));
  router.get('/projects/:pid/scenarios/:sid/versions/:version', wrap(async (req, res) => res.json(await scenarios.version(param(req, 'pid'), param(req, 'sid'), Number(param(req, 'version'))))));
  router.post('/projects/:pid/scenarios/:sid/versions', wrap(async (req, res) => {
    const body = EditBody.parse(req.body);
    res.status(201).json(await scenarios.saveEdited(param(req, 'pid'), param(req, 'sid'), body.text, body.parentVersion));
  }));
  router.post('/projects/:pid/scenarios/:sid/regenerate', wrap(async (req, res) => {
    const { planId } = CreateScenarioBody.parse(req.body);
    const stored = await plans.get(param(req, 'pid'), planId);
    res.status(201).json(await scenarios.regenerate(param(req, 'pid'), param(req, 'sid'), stored.plan, stored.plan.input));
  }));
  router.post('/projects/:pid/scenarios/:sid/versions/:version/approve', wrap(async (req, res) => {
    const body = ApproveBody.parse(req.body);
    res.json(await scenarios.approve(param(req, 'pid'), param(req, 'sid'), Number(param(req, 'version')), body));
  }));

  router.get('/projects/:pid/runs', wrap(async (req, res) => res.json({ runs: await runs.list(param(req, 'pid')) })));
  router.post('/projects/:pid/runs', wrap(async (req, res) => {
    const body = RunBody.parse(req.body);
    res.status(202).json({ run: await runs.start(param(req, 'pid'), body.scenarioId, body.version, { requestId: body.requestId, headed: body.headed }) });
  }));
  router.get('/projects/:pid/runs/:rid', wrap(async (req, res) => res.json({ run: await runs.get(param(req, 'pid'), param(req, 'rid')) })));
  router.post('/projects/:pid/runs/:rid/cancel', wrap(async (req, res) => res.json({ run: await runs.cancel(param(req, 'pid'), param(req, 'rid')) })));
  router.get('/projects/:pid/runs/:rid/artifacts/*file', wrap(async (req, res) => {
    const file = ([] as string[]).concat((req.params as Record<string, string | string[]>).file).join('/');
    const absolute = runs.artifactPath(param(req, 'pid'), param(req, 'rid'), file);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (file.endsWith('.html')) res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' data:; connect-src 'none'");
    res.sendFile(absolute, { dotfiles: 'deny' }, (error) => {
      if (error && !res.headersSent) res.status(404).json({ error: 'Artefacto no encontrado.', code: 'NOT_FOUND' });
    });
  }));

  // Server-Sent Events: replay persisted events after Last-Event-ID (or ?after), then stream live ones.
  router.get('/projects/:pid/runs/:rid/events', wrap(async (req, res) => {
    const projectId = param(req, 'pid');
    const runId = param(req, 'rid');
    const initial = await runs.get(projectId, runId);
    const after = Number.parseInt(String(req.get('Last-Event-ID') ?? req.query.after ?? '-1'), 10);
    let last = Number.isFinite(after) ? after : -1;
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 2000\n\n');
    let closed = false;
    let replaying = true;
    const buffered: RunEvent[] = [];
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);
    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
      res.write('event: end\ndata: {}\n\n');
      res.end();
    };
    const send = (event: RunEvent) => {
      if (closed || event.seq <= last) return;
      last = event.seq;
      res.write(`id: ${event.seq}\nevent: run\ndata: ${JSON.stringify(event)}\n\n`);
      if (event.type === 'run.finished') close();
    };
    const unsubscribe = runs.subscribe(runId, (event) => (replaying ? buffered.push(event) : send(event)));
    req.on('close', () => {
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
    });
    const { events } = await runs.events(projectId, runId, last);
    events.forEach(send);
    replaying = false;
    buffered.forEach(send);
    if (!closed && !runs.isActive(runId) && isTerminal((await runs.get(projectId, runId).catch(() => initial)).status)) close();
  }));

  router.use(errorHandler);
  return router;
}
