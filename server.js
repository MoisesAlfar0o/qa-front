import express from 'express';
import { spawn } from 'node:child_process';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiRouter } from './platform/api.ts';
import { createPlatform } from './platform/services.ts';

const root = path.dirname(fileURLToPath(import.meta.url));
const resultsDir = path.join(root, 'test-results');
const historyFile = path.join(resultsDir, 'runs.json');
const latestReport = path.join(resultsDir, 'latest.json');
const app = express();
const port = Number(process.env.PORT ?? 3001);
let isRunning = false;

const platform = createPlatform(process.env);
const recovered = await platform.runs.recover();
if (recovered.length) console.log(`Ejecuciones marcadas como INTERRUPTED tras el reinicio: ${recovered.join(', ')}`);

app.use('/report', express.static(path.join(root, 'playwright-report')));
app.use('/api', createApiRouter(platform));
app.use(express.json({ limit: '30kb' }));

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

const server = app.listen(port, '127.0.0.1', () => {
  console.log(`API de QA disponible en http://127.0.0.1:${port} (workspace: ${platform.config.workspace})`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await platform.runs.shutdown();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2_000).unref();
  });
}
