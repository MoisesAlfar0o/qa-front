import express from 'express';
import { spawn } from 'node:child_process';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executePlan, generatePlan, validateLocalUrl, validatePlan } from './planner-service.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const resultsDir = path.join(root, 'test-results');
const historyFile = path.join(resultsDir, 'runs.json');
const latestReport = path.join(resultsDir, 'latest.json');
const app = express();
const port = 3001;
let isRunning = false;
const plannerRuns = new Map();

app.use(express.json({ limit: '30kb' }));
app.use('/report', express.static(path.join(root, 'playwright-report')));

function publicPlannerRun(run) {
  return {
    id: run.id,
    status: run.status,
    activeStep: run.activeStep,
    steps: run.steps,
    logs: run.logs,
    screenshot: run.screenshot,
    currentUrl: run.currentUrl,
    finishedAt: run.finishedAt,
  };
}

app.get('/api/planner/status', async (_request, response) => {
  const base = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
  const model = process.env.OLLAMA_MODEL ?? 'qwen2.5:3b';
  try {
    const origin = validateLocalUrl(base).origin;
    const result = await fetch(`${origin}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (!result.ok) {
      response.json({ connected: false, model, message: `Ollama respondió ${result.status}.` });
      return;
    }
    const data = await result.json();
    const models = (data.models ?? []).map((item) => item.name);
    response.json({ connected: true, model, modelAvailable: models.some((name) => name === model || name.startsWith(`${model}:`)), models });
  } catch {
    response.json({ connected: false, model });
  }
});

app.post('/api/planner/plan', async (request, response) => {
  try {
    const { story, targetUrl } = request.body ?? {};
    const plan = await generatePlan(story, targetUrl);
    response.json(plan);
  } catch (error) {
    response.status(400).json({ error: error.message });
  }
});

app.post('/api/planner/runs', (request, response) => {
  try {
    const { targetUrl } = request.body ?? {};
    validateLocalUrl(targetUrl);
    const steps = validatePlan({ steps: request.body?.steps });
    if ([...plannerRuns.values()].some((run) => run.status === 'running')) {
      response.status(409).json({ error: 'Ya hay una ejecución del planner en curso.' });
      return;
    }

    const run = {
      id: `${Date.now()}`,
      status: 'running',
      activeStep: -1,
      steps: [
        { action: 'navigate', locatorType: 'text', locator: targetUrl, value: '', status: 'pending' },
        ...steps.map((step) => ({ ...step, status: 'pending' })),
      ],
      logs: [],
      screenshot: '',
      currentUrl: '',
      cancelRequested: false,
    };
    plannerRuns.set(run.id, run);
    response.status(202).json({ run: publicPlannerRun(run) });
    executePlan(run, targetUrl, steps).catch((error) => {
      run.status = 'failed';
      run.finishedAt = new Date().toISOString();
      run.logs.push({ type: 'error', text: error.message, at: run.finishedAt });
      console.error('Falló la ejecución del planner:', error);
    });
  } catch (error) {
    response.status(400).json({ error: error.message });
  }
});

app.get('/api/planner/runs/:id', (request, response) => {
  const run = plannerRuns.get(request.params.id);
  if (!run) {
    response.status(404).json({ error: 'No se encontró esa ejecución.' });
    return;
  }
  response.json({ run: publicPlannerRun(run) });
});

app.delete('/api/planner/runs/:id', (request, response) => {
  const run = plannerRuns.get(request.params.id);
  if (!run) {
    response.status(404).json({ error: 'No se encontró esa ejecución.' });
    return;
  }
  if (run.status === 'running') run.cancelRequested = true;
  response.json({ run: publicPlannerRun(run) });
});

async function getHistory() {
  try {
    return JSON.parse(await readFile(historyFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function summarizeReport(report, id, finishedAt) {
  const counts = report.stats ?? {};
  const tests = [];

  for (const suite of report.suites ?? []) {
    collectTests(suite, tests);
  }

  return {
    id,
    finishedAt,
    duration: counts.duration ?? 0,
    passed: counts.expected ?? 0,
    failed: (counts.unexpected ?? 0) + (counts.flaky ?? 0),
    skipped: counts.skipped ?? 0,
    status: counts.unexpected || counts.flaky ? 'failed' : 'passed',
    tests,
  };
}

function collectTests(suite, tests, parentTitle = '') {
  const title = [parentTitle, suite.title].filter(Boolean).join(' › ');

  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      const result = test.results?.at(-1);
      tests.push({
        title: [title, spec.title].filter(Boolean).join(' › '),
        status: result?.status ?? test.status ?? 'unknown',
        duration: result?.duration ?? 0,
        error: result?.error?.message,
      });
    }
  }

  for (const child of suite.suites ?? []) {
    collectTests(child, tests, title);
  }
}

app.get('/api/runs', async (_request, response, next) => {
  try {
    response.json({ runs: await getHistory(), isRunning });
  } catch (error) {
    next(error);
  }
});

app.post('/api/runs', async (_request, response) => {
  if (isRunning) {
    response.status(409).json({ error: 'Ya hay una ejecución en curso.' });
    return;
  }

  isRunning = true;
  try {
    await mkdir(resultsDir, { recursive: true });
    await unlink(latestReport).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });

    const child = spawn(
      process.execPath,
      [path.join(root, 'node_modules', '@playwright', 'test', 'cli.js'), 'test'],
      { cwd: root, windowsHide: true },
    );
    let output = '';
    let launchFailed = false;
    child.stdout.setEncoding('utf8').on('data', (chunk) => {
      output = `${output}${chunk}`.slice(-30_000);
    });
    child.stderr.setEncoding('utf8').on('data', (chunk) => {
      output = `${output}${chunk}`.slice(-30_000);
    });

    child.on('error', (error) => {
      launchFailed = true;
      isRunning = false;
      console.error('No se pudo iniciar Playwright:', error);
      if (!response.headersSent) {
        response.status(500).json({ error: 'No se pudo iniciar Playwright.' });
      }
    });

    child.on('close', async (exitCode) => {
      if (launchFailed) return;
      try {
        const report = JSON.parse(await readFile(latestReport, 'utf8'));
        const history = await getHistory();
        const run = summarizeReport(report, `${Date.now()}`, new Date().toISOString());
        history.unshift(run);
        await writeFile(historyFile, JSON.stringify(history.slice(0, 50), null, 2));
        response.status(200).json({ run, output, exitCode });
      } catch (error) {
        console.error('No se pudo guardar el reporte de Playwright:', error);
        response.status(500).json({
          error: 'Playwright terminó, pero no se pudo leer su reporte.',
          output,
          exitCode,
        });
      } finally {
        isRunning = false;
      }
    });
  } catch (error) {
    isRunning = false;
    console.error('No se pudo preparar la ejecución de Playwright:', error);
    response.status(500).json({ error: 'No se pudo preparar la ejecución.' });
  }
});

app.use((error, _request, response, _next) => {
  console.error('Error en el servidor de QA:', error);
  response.status(500).json({ error: 'Error interno del panel de QA.' });
});

app.listen(port, '127.0.0.1', () => {
  console.log(`API de QA disponible en http://127.0.0.1:${port}`);
});
