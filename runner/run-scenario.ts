/**
 * Child process that executes one approved scenario with Cucumber.js + Playwright.
 * Spawned by the run manager with an IPC channel; it streams every Cucumber message
 * envelope to the parent and never writes run state itself.
 *
 *   node runner/run-scenario.ts <job.json>
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfiguration, runCucumber } from '@cucumber/cucumber/api';

import { canonicalFeature, sha256 } from '../platform/hash.ts';
import { redact } from '../platform/security.ts';
import { requestCancel } from './cancel.ts';
import type { RuntimeConfig } from './support/world.ts';

export interface RunJob {
  featurePath: string;
  expectedHash: string;
  runtime: RuntimeConfig;
  messagesPath: string;
  reportPath: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const SUPPORT = ['support/world.ts', 'support/hooks.ts', 'support/steps.ts'].map((file) => path.join(here, file));

function send(message: unknown): Promise<void> {
  return new Promise((resolve) => {
    if (!process.send || !process.connected) return resolve();
    process.send(message, undefined, {}, () => resolve());
  });
}

process.on('message', (message: { type?: string }) => {
  if (message?.type === 'cancel') void requestCancel();
});
// If the server dies, stop the browser and exit instead of running orphaned.
process.on('disconnect', () => {
  void requestCancel().finally(() => setTimeout(() => process.exit(2), 1_000).unref());
});

async function main(): Promise<number> {
  const jobPath = process.argv[2];
  if (!jobPath) throw new Error('Missing job file argument.');
  const job = JSON.parse(await readFile(jobPath, 'utf8')) as RunJob;

  // The approved bytes are re-verified here, right before execution.
  const feature = await readFile(job.featurePath, 'utf8');
  const actualHash = sha256(canonicalFeature(feature));
  if (actualHash !== job.expectedHash) {
    await send({ type: 'fatal', code: 'HASH_MISMATCH', message: `El hash del escenario (${actualHash.slice(0, 12)}) no coincide con la versión aprobada (${job.expectedHash.slice(0, 12)}).` });
    return 3;
  }

  const { runConfiguration } = await loadConfiguration(
    {
      file: false,
      provided: {
        paths: [job.featurePath],
        import: SUPPORT,
        format: [['message', job.messagesPath], ['html', job.reportPath]],
        worldParameters: job.runtime as never,
        strict: true,
        failFast: false,
        parallel: 0,
        retry: 0,
      },
    },
    { cwd: ROOT },
  );
  const { success } = await runCucumber(runConfiguration, { cwd: ROOT }, (envelope) => {
    void send({ type: 'envelope', envelope });
  });
  await send({ type: 'done', success });
  return success ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
    if (process.connected) process.disconnect?.();
  })
  .catch(async (error: Error) => {
    await send({ type: 'fatal', code: 'RUNNER_ERROR', message: redact(error.message).slice(0, 500) });
    process.exitCode = 4;
    if (process.connected) process.disconnect?.();
  });
