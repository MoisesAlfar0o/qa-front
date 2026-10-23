import path from 'node:path';
import { mkdir } from 'node:fs/promises';

import { After, AfterStep, Before, setDefaultTimeout } from '@cucumber/cucumber';
import { chromium } from '@playwright/test';

import { isAllowedOrigin } from '../../platform/security.ts';
import { isCancelRequested, setActiveContext } from '../cancel.ts';
import type { QaWorld } from './world.ts';

export const ARTIFACT_MEDIA_TYPE = 'application/vnd.qa-front.artifact+json';

setDefaultTimeout(120_000);

function attachArtifact(world: QaWorld, artifact: { kind: 'screenshot' | 'trace'; file: string; stepIndex?: number }): void {
  world.attach(JSON.stringify(artifact), ARTIFACT_MEDIA_TYPE);
}

Before(async function (this: QaWorld) {
  const runtime = this.runtime;
  this.browser = await chromium.launch({ headless: runtime.headless });
  this.context = await this.browser.newContext({ storageState: runtime.storageStatePath ?? undefined, viewport: { width: 1366, height: 860 } });
  setActiveContext(this.context);
  this.context.setDefaultTimeout(runtime.actionTimeoutMs);
  // Every request leaving the authorized origins is blocked (SSRF / data exfiltration guard).
  await this.context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('data:') || url.startsWith('blob:') || isAllowedOrigin(url, runtime.allowedOrigins)) return route.continue();
    this.blockedRequests.push(new URL(url).origin);
    return route.abort('blockedbyclient');
  });
  if (runtime.trace) await this.context.tracing.start({ screenshots: true, snapshots: true });
  this.mainPage = await this.context.newPage();
  this.currentPage = this.mainPage;
  if (isCancelRequested()) await this.context.close();
});

AfterStep(async function (this: QaWorld) {
  this.stepIndex += 1;
  if (isCancelRequested() || !this.currentPage || this.currentPage.isClosed()) return;
  const dir = path.join(this.runtime.runDir, 'screenshots');
  await mkdir(dir, { recursive: true });
  const file = `screenshots/step-${String(this.stepIndex).padStart(2, '0')}.jpg`;
  try {
    await this.currentPage.screenshot({ path: path.join(this.runtime.runDir, file), type: 'jpeg', quality: 60, timeout: 5_000 });
    attachArtifact(this, { kind: 'screenshot', file, stepIndex: this.stepIndex - 1 });
  } catch {
    // A failed screenshot must not change the step result.
  }
});

After(async function (this: QaWorld) {
  try {
    if (this.runtime.trace && this.context && !isCancelRequested()) {
      const file = 'traces/trace.zip';
      await mkdir(path.join(this.runtime.runDir, 'traces'), { recursive: true });
      await this.context.tracing.stop({ path: path.join(this.runtime.runDir, file) });
      attachArtifact(this, { kind: 'trace', file });
    }
  } catch {
    // The context may already be closed by a cancellation.
  } finally {
    setActiveContext(null);
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
  }
});
