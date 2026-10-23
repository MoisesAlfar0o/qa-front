import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { breadcrumbs, collapsedMenuButtons, extractSnapshotYaml, headings, interactiveElements, navLinks, parseAriaSnapshot, tables, type AriaElement, type AriaTable } from './aria-snapshot.ts';
import { riskOfControlName } from './catalog.ts';
import { ROOT } from './config.ts';
import type { McpReport } from './inventory.ts';
import type { NavObservation } from './navigation.ts';
import { isAllowedOrigin, redact } from './security.ts';

/**
 * Real Model Context Protocol client for the Playwright MCP server shipped with
 * @playwright/test (`playwright mcp`, stdio transport). Only read-only tools are called;
 * `browser_click` is used solely on collapsed menu buttons whose name is not risky.
 * Element refs (e12…) are session-scoped and never persisted.
 */

const ALLOWED_TOOLS = new Set(['browser_navigate', 'browser_snapshot', 'browser_click', 'browser_close']);
const REQUIRED_TOOLS = ['browser_navigate', 'browser_snapshot'];

export interface McpPageSnapshot {
  route: string;
  url: string;
  yaml: string;
  headings: string[];
  breadcrumbs: string[];
  tables: AriaTable[];
  elements: AriaElement[];
}

export interface McpExploration {
  report: McpReport;
  navObservations: NavObservation[];
  snapshots: McpPageSnapshot[];
}

export interface McpExploreOptions {
  baseUrl: string;
  startPath: string;
  allowedOrigins: string[];
  outputDir: string;
  storageStatePath?: string;
  maxPages?: number;
  timeoutMs?: number;
  onProgress?: (message: string) => void;
}

function textContent(result: unknown): string {
  const content = (result as { content?: { type: string; text?: string }[] }).content ?? [];
  return content.filter((item) => item.type === 'text').map((item) => item.text ?? '').join('\n');
}

export async function exploreWithMcp(options: McpExploreOptions): Promise<McpExploration> {
  const report: McpReport = { used: false, toolsAvailable: [], calls: [], pagesSnapshotted: 0, navLinks: 0, unmatched: 0 };
  const args = [
    path.join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js'),
    'mcp',
    '--headless',
    '--isolated',
    '--allowed-origins',
    options.allowedOrigins.join(';'),
    '--output-dir',
    options.outputDir,
  ];
  if (options.storageStatePath) args.push('--storage-state', options.storageStatePath);
  const transport = new StdioClientTransport({ command: process.execPath, args, stderr: 'pipe', cwd: ROOT });
  const client = new Client({ name: 'qa-front-explorer', version: '1.0.0' });
  const deadline = Date.now() + (options.timeoutMs ?? 90_000);
  const navObservations = new Map<string, NavObservation>();
  const snapshots: McpPageSnapshot[] = [];

  const call = async (tool: string, toolArgs: Record<string, unknown>): Promise<string> => {
    if (!ALLOWED_TOOLS.has(tool)) throw new Error(`Herramienta MCP no permitida: ${tool}`);
    if (Date.now() > deadline) throw new Error('Tiempo de exploración MCP agotado.');
    const started = Date.now();
    let result: unknown;
    try {
      result = await client.callTool({ name: tool, arguments: toolArgs }, undefined, { timeout: 30_000 });
    } catch (error) {
      report.calls.push({ tool, ok: false, ms: Date.now() - started });
      throw error;
    }
    const failed = Boolean((result as { isError?: boolean }).isError);
    report.calls.push({ tool, ok: !failed, ms: Date.now() - started });
    const text = textContent(result);
    if (failed) throw new Error(redact(text).slice(0, 300));
    return text;
  };

  const snapshot = async (): Promise<{ url: string; yaml: string }> => {
    const text = await call('browser_snapshot', {});
    const yaml = extractSnapshotYaml(text);
    if (!yaml) throw new Error('La respuesta de browser_snapshot no contiene un snapshot ARIA.');
    const url = text.match(/Page URL: (\S+)/)?.[1] ?? '';
    return { url, yaml };
  };

  const recordNav = (yaml: string, url: string) => {
    for (const link of navLinks(parseAriaSnapshot(yaml))) {
      if (!link.route) continue;
      const absolute = new URL(link.route, options.baseUrl).href;
      if (!isAllowedOrigin(absolute, options.allowedOrigins)) continue;
      const route = new URL(absolute).pathname;
      navObservations.set(`${link.path.join('>')}|${route}`, { path: link.path, route, control: 'link', url, source: 'mcp-aria' });
    }
  };

  try {
    await client.connect(transport);
    report.serverVersion = client.getServerVersion()?.version;
    const tools = await client.listTools();
    report.toolsAvailable = tools.tools.map((tool) => tool.name).sort();
    const missing = REQUIRED_TOOLS.filter((tool) => !report.toolsAvailable.includes(tool));
    if (missing.length) throw new Error(`El servidor MCP no expone ${missing.join(', ')}.`);
    // The element-reference argument was renamed across Playwright MCP versions (ref → target).
    const clickProps = Object.keys((tools.tools.find((tool) => tool.name === 'browser_click')?.inputSchema.properties ?? {}) as Record<string, unknown>);
    const refArg = clickProps.includes('target') ? 'target' : 'ref';

    const startUrl = new URL(options.startPath, options.baseUrl).href;
    options.onProgress?.(`MCP: abriendo ${startUrl}`);
    await call('browser_navigate', { url: startUrl });
    let current = await snapshot();
    recordNav(current.yaml, current.url);

    // Expand collapsed menu groups one by one; accordions may close others, so links are accumulated.
    const clicked = new Set<string>();
    for (let round = 0; round < 30; round += 1) {
      const next = collapsedMenuButtons(parseAriaSnapshot(current.yaml)).find((button) => !clicked.has(button.name));
      if (!next) break;
      clicked.add(next.name);
      if (riskOfControlName(next.name) !== 'read') continue;
      try {
        await call('browser_click', { element: `Menu group ${next.name}`, [refArg]: next.ref });
        current = await snapshot();
        recordNav(current.yaml, current.url);
      } catch (error) {
        options.onProgress?.(`MCP: no se pudo expandir ${next.name}: ${(error as Error).message}`);
      }
    }

    const routes = [...new Set([...navObservations.values()].map((observation) => observation.route as string))].slice(0, options.maxPages ?? 25);
    for (const route of routes) {
      if (Date.now() > deadline) break;
      options.onProgress?.(`MCP: snapshot de ${route}`);
      await call('browser_navigate', { url: new URL(route, options.baseUrl).href });
      const page = await snapshot();
      const root = parseAriaSnapshot(page.yaml);
      snapshots.push({ route, url: page.url, yaml: page.yaml, headings: headings(root), breadcrumbs: breadcrumbs(root), tables: tables(root), elements: interactiveElements(root) });
    }
    await call('browser_close', {}).catch(() => undefined);
    report.used = true;
  } catch (error) {
    report.reason = redact((error as Error).message).slice(0, 300);
  } finally {
    await client.close().catch(() => undefined);
  }
  report.pagesSnapshotted = snapshots.length;
  report.navLinks = navObservations.size;
  return { report, navObservations: [...navObservations.values()], snapshots };
}
