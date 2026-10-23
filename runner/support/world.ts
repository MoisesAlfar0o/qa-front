import { setWorldConstructor, World, type IWorldOptions } from '@cucumber/cucumber';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import type { NavigationMap } from '../../platform/navigation.ts';

/** Runtime settings passed by the run manager as Cucumber world parameters (no secrets). */
export interface RuntimeConfig {
  baseUrl: string;
  allowedOrigins: string[];
  headless: boolean;
  navigation: NavigationMap | null;
  storageStatePath: string | null;
  runDir: string;
  actionTimeoutMs: number;
  expectTimeoutMs: number;
  trace: boolean;
}

export class QaWorld extends World<RuntimeConfig> {
  browser: Browser | null = null;
  context: BrowserContext | null = null;
  mainPage: Page | null = null;
  currentPage: Page | null = null;
  stepIndex = 0;
  blockedRequests: string[] = [];

  constructor(options: IWorldOptions<RuntimeConfig>) {
    super(options);
  }

  get runtime(): RuntimeConfig {
    return this.parameters;
  }

  get page(): Page {
    if (!this.currentPage) throw new Error('El navegador no está iniciado.');
    return this.currentPage;
  }
}

setWorldConstructor(QaWorld);
