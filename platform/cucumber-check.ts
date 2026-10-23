import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';

import { loadConfiguration, loadSupport, runCucumber, type ISupportCodeLibrary } from '@cucumber/cucumber/api';

import { ROOT } from './config.ts';

const SUPPORT = ['runner/support/world.ts', 'runner/support/hooks.ts', 'runner/support/steps.ts'].map((file) => path.join(ROOT, file));

let support: Promise<ISupportCodeLibrary> | null = null;

export interface DryRunResult {
  ok: boolean;
  steps: number;
  undefinedSteps: string[];
  ambiguousSteps: string[];
  errors: string[];
}

async function configuration(featurePath: string) {
  const { runConfiguration } = await loadConfiguration({ file: false, provided: { paths: [featurePath], import: SUPPORT, dryRun: true, strict: true, format: [] } }, { cwd: ROOT });
  return runConfiguration;
}

/**
 * Real Cucumber dry run against the runner's step definitions: proves every step of the
 * feature binds to exactly one implementation without opening a browser.
 */
export async function cucumberDryRun(featureText: string): Promise<DryRunResult> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'qa-front-dry-'));
  const featurePath = path.join(dir, 'scenario.feature');
  try {
    await writeFile(featurePath, featureText, 'utf8');
    const runConfiguration = await configuration(featurePath);
    support ??= loadSupport(runConfiguration, { cwd: ROOT });
    const library = await support;
    const pickleSteps = new Map<string, string>();
    const testSteps = new Map<string, string>();
    const result: DryRunResult = { ok: false, steps: 0, undefinedSteps: [], ambiguousSteps: [], errors: [] };
    const { success } = await runCucumber({ ...runConfiguration, support: library }, { cwd: ROOT, stdout: devNull(), stderr: devNull() }, (envelope) => {
      if (envelope.pickle) for (const step of envelope.pickle.steps) pickleSteps.set(step.id, step.text);
      if (envelope.testCase) for (const step of envelope.testCase.testSteps) if (step.pickleStepId) testSteps.set(step.id, pickleSteps.get(step.pickleStepId) ?? '');
      if (envelope.testStepFinished) {
        const text = testSteps.get(envelope.testStepFinished.testStepId);
        if (text === undefined) return;
        result.steps += 1;
        const status = envelope.testStepFinished.testStepResult.status;
        if (status === 'UNDEFINED') result.undefinedSteps.push(text);
        if (status === 'AMBIGUOUS') result.ambiguousSteps.push(text);
      }
      if (envelope.parseError) result.errors.push(envelope.parseError.message);
    });
    result.ok = success && result.steps > 0 && !result.undefinedSteps.length && !result.ambiguousSteps.length && !result.errors.length;
    return result;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function devNull(): Writable {
  return new Writable({ write: (_chunk, _encoding, callback) => callback() });
}
