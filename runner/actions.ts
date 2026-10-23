import type { Locator, Page } from '@playwright/test';

import type { RowCriteria, Target } from '../platform/catalog.ts';
import { renderTarget } from '../platform/catalog.ts';
import { locatorFor, visible } from '../platform/locators.ts';
import { resolveNavigation, type NavNode } from '../platform/navigation.ts';
import { isAllowedOrigin } from '../platform/security.ts';
import { isCancelRequested } from './cancel.ts';
import { AssertionFailedError, ElementResolutionError, RunCancelledError, TechnicalError } from './errors.ts';
import type { QaWorld } from './support/world.ts';

const POLL_MS = 150;
const NAV_SELECTOR = 'nav:not([aria-label*="ruta" i]):not([aria-label*="breadcrumb" i]):not([aria-label*="migas" i]), [role="navigation"]:not([aria-label*="ruta" i]):not([aria-label*="breadcrumb" i])';
const TABLE_SELECTOR = 'table, [role="table"], [role="grid"]';
const ROW_SELECTOR = 'tr, [role="row"]';
const CELL_SELECTOR = 'td, th, [role="cell"], [role="gridcell"], [role="rowheader"]';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function assertNotCancelled(): void {
  if (isCancelRequested()) throw new RunCancelledError('Ejecución cancelada por el usuario.');
}

/** Polls `read` until `done` holds or the timeout elapses; returns the last value read. */
async function poll<T>(read: () => Promise<T>, done: (value: T) => boolean, timeoutMs: number): Promise<{ value: T; ok: boolean }> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    assertNotCancelled();
    const value = await read();
    if (done(value)) return { value, ok: true };
    if (Date.now() >= deadline) return { value, ok: false };
    await sleep(POLL_MS);
  }
}

/** Waits until exactly one visible element matches; zero or several matches are reported, never guessed. */
async function unique(world: QaWorld, locator: Locator, description: string): Promise<Locator> {
  const candidates = visible(locator);
  const { value: count } = await poll(() => candidates.count(), (value) => value >= 1, world.runtime.actionTimeoutMs);
  if (count === 0) throw new ElementResolutionError(`No se encontró ${description} visible en la página.`);
  if (count > 1) throw new ElementResolutionError(`${description} coincide con ${count} elementos visibles; el paso debe identificar uno solo.`);
  return candidates.first();
}

function target(world: QaWorld, value: Target, scope?: Locator): Promise<Locator> {
  return unique(world, locatorFor(scope ?? world.page, value, { inRow: Boolean(scope) }), renderTarget(value));
}

// --- Tables ------------------------------------------------------------------------------

interface RowMatch {
  tableIndex: number;
  rows: number[];
  headers: string[];
}

/** Finds data rows whose cells, located by exact column header, equal the given values. */
async function matchRows(page: Page, criteria: RowCriteria): Promise<RowMatch> {
  const result = await page.evaluate(
    ({ criteria, tableSelector, rowSelector, cellSelector }) => {
      const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
      const shown = (el: Element) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden';
      };
      const tables = [...document.querySelectorAll(tableSelector)].map((table, index) => ({ table, index })).filter(({ table }) => shown(table));
      const candidates = tables.map(({ table, index }) => {
        const headers = [...table.querySelectorAll('th, [role="columnheader"]')].map((cell) => clean(cell.textContent));
        return { table, index, headers };
      }).filter(({ headers }) => criteria.every((item) => headers.includes(item.column)));
      if (candidates.length !== 1) return { error: candidates.length === 0 ? 'columns' : 'tables', count: candidates.length, available: tables.map(({ table }) => [...table.querySelectorAll('th, [role="columnheader"]')].map((cell) => clean(cell.textContent))) };
      const { table, index, headers } = candidates[0];
      const rows = [...table.querySelectorAll(rowSelector)].filter((row) => row.querySelector('td, [role="cell"], [role="gridcell"]'));
      const matches: number[] = [];
      rows.forEach((row, rowIndex) => {
        if (!shown(row)) return;
        const cells = [...row.querySelectorAll(cellSelector)].map((cell) => clean(cell.textContent));
        if (criteria.every((item) => cells[headers.indexOf(item.column)] === clean(item.value))) matches.push(rowIndex);
      });
      return { tableIndex: index, rows: matches, headers, rowCount: rows.length };
    },
    { criteria, tableSelector: TABLE_SELECTOR, rowSelector: ROW_SELECTOR, cellSelector: CELL_SELECTOR },
  );
  if ('error' in result) {
    if (result.error === 'tables') throw new ElementResolutionError(`Hay ${result.count} tablas visibles con las columnas ${criteria.map((item) => `"${item.column}"`).join(', ')}; no se puede elegir una.`);
    const seen = (result.available ?? []).map((headers) => headers.join(', ')).join(' | ') || 'ninguna tabla visible';
    throw new ElementResolutionError(`No hay una tabla visible con las columnas ${criteria.map((item) => `"${item.column}"`).join(', ')} (columnas observadas: ${seen}).`);
  }
  return result;
}

function rowLocator(page: Page, match: RowMatch, rowIndex: number): Locator {
  return page.locator(TABLE_SELECTOR).nth(match.tableIndex).locator(ROW_SELECTOR).filter({ has: page.locator('td, [role="cell"], [role="gridcell"]') }).nth(rowIndex);
}

const describeCriteria = (criteria: RowCriteria) => criteria.map((item) => `${item.column} = "${item.value}"`).join(' y ');

async function waitRows(world: QaWorld, criteria: RowCriteria, done: (rows: number) => boolean) {
  let last: RowMatch | null = null;
  let lastError: unknown = null;
  const outcome = await poll(
    async () => {
      try {
        last = await matchRows(world.page, criteria);
        lastError = null;
        return last.rows.length;
      } catch (error) {
        if (!(error instanceof ElementResolutionError)) throw error;
        lastError = error;
        return -1;
      }
    },
    (rows) => rows >= 0 && done(rows),
    world.runtime.expectTimeoutMs,
  );
  if (lastError) throw lastError;
  return { ...outcome, match: last as unknown as RowMatch };
}

async function uniqueRow(world: QaWorld, criteria: RowCriteria): Promise<Locator> {
  const { value, match } = await waitRows(world, criteria, (rows) => rows >= 1);
  if (value === 0) throw new ElementResolutionError(`No hay ninguna fila donde ${describeCriteria(criteria)}.`);
  if (value > 1) throw new ElementResolutionError(`Hay ${value} filas donde ${describeCriteria(criteria)}; añade otra columna para identificar una sola.`);
  return rowLocator(world.page, match, match.rows[0]);
}

async function tableRows(page: Page): Promise<{ headers: string[]; rows: string[][] }> {
  const tables = await page.evaluate(
    ({ tableSelector, rowSelector, cellSelector }) => {
      const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
      return [...document.querySelectorAll(tableSelector)].filter((table) => table.getBoundingClientRect().height > 0).map((table) => ({
        headers: [...table.querySelectorAll('th, [role="columnheader"]')].map((cell) => clean(cell.textContent)),
        rows: [...table.querySelectorAll(rowSelector)].filter((row) => row.querySelector('td, [role="cell"], [role="gridcell"]') && row.getBoundingClientRect().height > 0).map((row) => [...row.querySelectorAll(cellSelector)].map((cell) => clean(cell.textContent))),
      }));
    },
    { tableSelector: TABLE_SELECTOR, rowSelector: ROW_SELECTOR, cellSelector: CELL_SELECTOR },
  );
  if (tables.length !== 1) throw new ElementResolutionError(tables.length === 0 ? 'No hay ninguna tabla visible.' : `Hay ${tables.length} tablas visibles; el paso no indica cuál.`);
  return tables[0];
}

// --- Navigation --------------------------------------------------------------------------

async function openModule(world: QaWorld, segments: string[]): Promise<void> {
  const page = world.page;
  const resolution = resolveNavigation(world.runtime.navigation, segments);
  if (resolution.status === 'ambiguous') throw new ElementResolutionError(`"${segments.join(' > ')}" coincide con varios módulos: ${resolution.candidates.map((node) => node.path.join(' > ')).join(' | ')}.`);
  const path = resolution.status === 'resolved' ? resolution.node.path : segments;
  const node: NavNode | null = resolution.status === 'resolved' ? resolution.node : null;

  let scope: Locator = page.locator(NAV_SELECTOR);
  for (const [depth, name] of path.entries()) {
    const isLeaf = depth === path.length - 1;
    const control = scope.getByRole(isLeaf && node?.navRef?.kind === 'link' ? 'link' : 'button', { name, exact: true }).or(scope.getByRole('menuitem', { name, exact: true })).or(scope.getByRole('link', { name, exact: true }));
    const element = await unique(world, control, `la opción de menú "${name}"${depth ? ` dentro de "${path.slice(0, depth).join(' > ')}"` : ''}`);
    if (isLeaf) {
      await element.click();
      break;
    }
    const expanded = await element.getAttribute('aria-expanded');
    if (expanded === 'false') await element.click();
    const controls = await element.getAttribute('aria-controls');
    // Scope the next level to the group the control owns, so equal names in other groups are ignored.
    scope = controls ? page.locator(`[id="${controls.replace(/"/g, '')}"]`) : element.locator('xpath=ancestor::li[1]');
  }

  if (node?.route) {
    const expected = node.route;
    const { ok, value } = await poll(async () => new URL(page.url()).pathname, (pathname) => pathname === expected, world.runtime.actionTimeoutMs);
    if (!ok) throw new AssertionFailedError(`Tras abrir "${path.join(' > ')}" la ruta es ${value}, se esperaba ${expected} (según el mapa de navegación).`);
  } else {
    await page.waitForLoadState('domcontentloaded');
  }
}

// --- Action dispatch ---------------------------------------------------------------------

type Params = Record<string, any>;

const KEY_ALIASES: Record<string, string> = { Space: ' ' };

async function textOf(locator: Locator): Promise<string> {
  return (await locator.innerText()).replace(/\s+/g, ' ').trim();
}

export async function executeAction(world: QaWorld, actionId: string, p: Params): Promise<void> {
  assertNotCancelled();
  const timeout = world.runtime.expectTimeoutMs;
  const page = world.page;
  switch (actionId) {
    case 'navigate_url': {
      const url = new URL(p.path, world.runtime.baseUrl).href;
      if (!isAllowedOrigin(url, world.runtime.allowedOrigins)) throw new TechnicalError(`La ruta ${p.path} sale de los orígenes autorizados.`);
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      return;
    }
    case 'session_ready':
      if (!world.runtime.storageStatePath) throw new TechnicalError('El escenario requiere sesión iniciada y el proyecto no tiene estado de autenticación guardado.');
      return;
    case 'open_module':
      return openModule(world, p.path);
    case 'click':
      await (await target(world, p.target)).click();
      return;
    case 'click_popup': {
      const element = await target(world, p.target);
      const [popup] = await Promise.all([page.context().waitForEvent('page', { timeout: world.runtime.actionTimeoutMs }), element.click()]);
      await popup.waitForLoadState('domcontentloaded');
      if (!isAllowedOrigin(popup.url(), world.runtime.allowedOrigins)) throw new TechnicalError('La nueva pestaña abrió un origen no autorizado.');
      world.currentPage = popup;
      return;
    }
    case 'switch_main':
      if (!world.mainPage) throw new TechnicalError('No hay pestaña principal.');
      world.currentPage = world.mainPage;
      await world.mainPage.bringToFront();
      return;
    case 'row_action': {
      const row = await uniqueRow(world, p.criteria);
      await (await target(world, p.target, row)).click();
      return;
    }
    case 'fill':
    case 'clear': {
      const field = await target(world, p.target);
      if (await field.evaluate((el) => (el as HTMLInputElement).type === 'password')) throw new TechnicalError('Por seguridad no se rellenan campos de contraseña desde un escenario.');
      await field.fill(actionId === 'clear' ? '' : p.value);
      return;
    }
    case 'select_option': {
      const field = await target(world, p.target);
      const options = await field.evaluate((el) => [...((el as HTMLSelectElement).options ?? [])].map((option) => ({ label: option.label.trim(), value: option.value })));
      if (!options.length) throw new ElementResolutionError(`${renderTarget(p.target)} no es un desplegable con opciones.`);
      const option = options.find((item) => item.label === p.option) ?? options.find((item) => item.value === p.option);
      if (!option) throw new ElementResolutionError(`La opción "${p.option}" no existe en ${renderTarget(p.target)}. Opciones: ${options.map((item) => item.label).join(', ')}.`);
      await field.selectOption(option.value);
      return;
    }
    case 'check':
      await (await target(world, p.target)).check();
      return;
    case 'uncheck':
      await (await target(world, p.target)).uncheck();
      return;
    case 'press_key':
      await page.keyboard.press(KEY_ALIASES[p.key] ?? p.key);
      return;
    case 'expect_visible': {
      const { ok } = await poll(() => visible(locatorFor(page, p.target)).count(), (count) => count >= 1, timeout);
      if (!ok) throw new AssertionFailedError(`No se ve ${renderTarget(p.target)}.`);
      return;
    }
    case 'expect_hidden': {
      const { ok, value } = await poll(() => visible(locatorFor(page, p.target)).count(), (count) => count === 0, timeout);
      if (!ok) throw new AssertionFailedError(`Se esperaba no ver ${renderTarget(p.target)}, pero hay ${value} visibles.`);
      return;
    }
    case 'expect_contains_text': {
      const element = await target(world, p.target);
      const { ok, value } = await poll(() => textOf(element), (text) => text.includes(p.text), timeout);
      if (!ok) throw new AssertionFailedError(`${renderTarget(p.target)} contiene "${value}", no "${p.text}".`);
      return;
    }
    case 'expect_value': {
      const element = await target(world, p.target);
      const read = () => element.evaluate((el) => (el instanceof HTMLSelectElement ? el.selectedOptions[0]?.label.trim() ?? '' : (el as HTMLInputElement).value));
      const { ok, value } = await poll(read, (current) => current === p.value, timeout);
      if (!ok) throw new AssertionFailedError(`${renderTarget(p.target)} tiene el valor "${value}", se esperaba "${p.value}".`);
      return;
    }
    case 'expect_count': {
      const { ok, value } = await poll(() => visible(locatorFor(page, p.target)).count(), (count) => count === p.count, timeout);
      if (!ok) throw new AssertionFailedError(`Se esperaban ${p.count} ${renderTarget(p.target)} visibles y hay ${value}.`);
      return;
    }
    case 'expect_url': {
      const { ok, value } = await poll(async () => page.url(), (url) => url.includes(p.fragment), timeout);
      if (!ok) throw new AssertionFailedError(`La URL ${new URL(value).pathname} no contiene "${p.fragment}".`);
      return;
    }
    case 'expect_row': {
      const { ok } = await waitRows(world, p.criteria, (rows) => rows >= 1);
      if (!ok) throw new AssertionFailedError(`La tabla no muestra ninguna fila donde ${describeCriteria(p.criteria)}.`);
      return;
    }
    case 'expect_no_row': {
      const { ok, value } = await waitRows(world, p.criteria, (rows) => rows === 0);
      if (!ok) throw new AssertionFailedError(`La tabla muestra ${value} filas donde ${describeCriteria(p.criteria)}.`);
      return;
    }
    case 'expect_row_count': {
      const { ok, value } = await poll(async () => (await tableRows(page)).rows.length, (count) => count === p.count, timeout);
      if (!ok) throw new AssertionFailedError(`La tabla muestra ${value} filas, se esperaban ${p.count}.`);
      return;
    }
    case 'expect_column_all': {
      const read = async () => {
        const table = await tableRows(page);
        const column = table.headers.indexOf(p.column);
        if (column === -1) throw new ElementResolutionError(`La tabla no tiene la columna "${p.column}" (columnas: ${table.headers.join(', ')}).`);
        return table.rows.map((row) => row[column]);
      };
      const { ok, value } = await poll(read, (values) => values.length > 0 && values.every((cell) => cell === p.value), timeout);
      if (!ok) throw new AssertionFailedError(value.length === 0 ? `La tabla no tiene filas para comprobar "${p.column}".` : `No todas las filas tienen "${p.column}" = "${p.value}": ${[...new Set(value)].join(', ')}.`);
      return;
    }
    default:
      throw new TechnicalError(`Acción sin implementación en el runner: ${actionId}`);
  }
}
