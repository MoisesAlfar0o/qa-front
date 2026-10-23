import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { riskOfControlName, TARGET_KINDS, type Target, type TargetKind } from './catalog.ts';
import type { LocatorCandidate, ObservedElement, ObservedPage, ObservedTable, RowControl } from './inventory.ts';
import { locatorFor, visible } from './locators.ts';
import type { NavObservation } from './navigation.ts';
import { isAllowedOrigin } from './security.ts';
import { normalizeText, slugify } from './text.ts';

// --- In-page collection ------------------------------------------------------------------
// The collector runs inside the target page and only reads the DOM. Its output is untrusted
// page data: names and texts are used as literals, never as code or selectors.

interface RawElement {
  role: string;
  name: string;
  nameSource: ObservedElement['nameSource'];
  tag: string;
  inputType?: string;
  label?: string;
  placeholder?: string;
  testId?: string;
  title?: string;
  text?: string;
  href?: string;
  opensPopup: boolean;
  inNavigation: boolean;
}

interface RawRowControl {
  role: string;
  name: string;
  title?: string;
  testId?: string;
  iconText?: string;
}

interface RawTable {
  index: number;
  name: string;
  headers: string[];
  rowCount: number;
  sampleRows: string[][];
  firstRowControls: RawRowControl[];
}

interface RawPage {
  title: string;
  headings: string[];
  breadcrumbs: string[];
  dialogs: string[];
  elements: RawElement[];
  tables: RawTable[];
  contentLinks: { name: string; href: string; opensPopup: boolean }[];
}

interface RawNavLink {
  path: string[];
  href: string;
}

function collectPage(): RawPage {
  const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
  const BREADCRUMB = /breadcrumb|ruta de navegaci|migas/i;
  const visibleEl = (el: Element) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const textOf = (el: Node, skip?: Element): string => {
    let out = '';
    el.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) out += child.textContent ?? '';
      else if (child instanceof Element && child !== skip && child.getAttribute('aria-hidden') !== 'true' && !['SCRIPT', 'STYLE', 'SELECT', 'OPTION'].includes(child.tagName)) out += ` ${textOf(child, skip)}`;
    });
    return out;
  };
  const labelOf = (el: Element) => {
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) return clean(textOf(label));
    }
    const wrap = el.closest('label');
    return wrap ? clean(textOf(wrap, el)) : '';
  };
  const implicitRole = (el: Element) => {
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    if (tag === 'button' || (tag === 'input' && ['button', 'submit', 'reset'].includes(type))) return 'button';
    if (tag === 'a' && el.hasAttribute('href')) return 'link';
    if (tag === 'input') {
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'search') return 'searchbox';
      if (type === 'number') return 'spinbutton';
      return 'textbox';
    }
    if (tag === 'textarea') return 'textbox';
    if (tag === 'select') return (el as HTMLSelectElement).multiple ? 'listbox' : 'combobox';
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (tag === 'dialog') return 'dialog';
    return '';
  };
  const roleOf = (el: Element) => clean(el.getAttribute('role')).split(' ')[0] || implicitRole(el);
  const nameOf = (el: Element): [string, ObservedElement['nameSource']] => {
    const aria = clean(el.getAttribute('aria-label'));
    if (aria) return [aria, 'aria-label'];
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const text = labelledBy.split(/\s+/).map((id) => document.getElementById(id)).filter((node): node is HTMLElement => Boolean(node)).map((node) => clean(textOf(node))).join(' ');
      if (text) return [text, 'aria-labelledby'];
    }
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) {
      const label = labelOf(el);
      if (label) return [label, 'label'];
      if (el.tagName === 'INPUT' && ['button', 'submit', 'reset'].includes((el as HTMLInputElement).type)) return [clean((el as HTMLInputElement).value), 'text'];
    } else {
      const text = clean(textOf(el));
      if (text) return [text, 'text'];
      const img = el.querySelector('img[alt]');
      if (img && clean(img.getAttribute('alt'))) return [clean(img.getAttribute('alt')), 'alt'];
    }
    if (clean(el.getAttribute('title'))) return [clean(el.getAttribute('title')), 'title'];
    if (clean(el.getAttribute('placeholder'))) return [clean(el.getAttribute('placeholder')), 'placeholder'];
    return ['', 'none'];
  };
  const inRow = (el: Element) => Boolean(el.closest('tbody tr, [role="row"]')) && !el.closest('thead');
  const isNav = (el: Element) => {
    const nav = el.closest('nav, [role="navigation"]');
    return Boolean(nav) && !BREADCRUMB.test(nav?.getAttribute('aria-label') ?? '');
  };
  const inBreadcrumbs = (el: Element) => {
    const nav = el.closest('nav, [role="navigation"]');
    return Boolean(nav) && BREADCRUMB.test(nav?.getAttribute('aria-label') ?? '');
  };
  const KEEP = new Set(['button', 'link', 'tab', 'checkbox', 'radio', 'switch', 'menuitem', 'heading', 'dialog', 'combobox', 'textbox', 'searchbox', 'spinbutton', 'status', 'alert']);

  const elements: RawElement[] = [];
  const seen = new Set<Element>();
  document.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, [role], h1, h2, h3, h4, [data-testid], [title]').forEach((el) => {
    if (seen.has(el) || !visibleEl(el) || inRow(el) || inBreadcrumbs(el)) return;
    seen.add(el);
    const role = roleOf(el);
    const testId = clean(el.getAttribute('data-testid')) || undefined;
    const title = clean(el.getAttribute('title')) || undefined;
    if (!KEEP.has(role) && !testId && !title) return;
    const [name, nameSource] = nameOf(el);
    const anchor = el.tagName === 'A' ? (el as HTMLAnchorElement) : null;
    elements.push({
      role,
      name,
      nameSource,
      tag: el.tagName.toLowerCase(),
      inputType: el.tagName === 'INPUT' ? (el as HTMLInputElement).type : undefined,
      label: ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) ? labelOf(el) || undefined : undefined,
      placeholder: clean(el.getAttribute('placeholder')) || undefined,
      testId,
      title,
      text: ['heading', 'status', 'alert'].includes(role) || !role ? clean(textOf(el)) || undefined : undefined,
      href: anchor ? anchor.href : undefined,
      opensPopup: anchor ? anchor.target === '_blank' : false,
      inNavigation: isNav(el),
    });
  });

  const tables: RawTable[] = [];
  document.querySelectorAll('table, [role="table"], [role="grid"]').forEach((table, index) => {
    if (!visibleEl(table)) return;
    const headerCells = [...table.querySelectorAll('th, [role="columnheader"]')];
    const rows = [...table.querySelectorAll('tbody tr, [role="row"]')].filter((row) => row.querySelector('td, [role="cell"], [role="gridcell"]'));
    const labelledBy = table.getAttribute('aria-labelledby');
    const name = clean(table.getAttribute('aria-label'))
      || (labelledBy ? clean(labelledBy.split(/\s+/).map((ref) => document.getElementById(ref)?.textContent ?? '').join(' ')) : '')
      || clean(table.querySelector('caption')?.textContent);
    const first = rows[0];
    const firstRowControls: RawRowControl[] = first
      ? [...first.querySelectorAll('button, a[href], [role="button"], [role="menuitem"], [role="link"]')].filter(visibleEl).map((control) => {
          const raw = clean(control.textContent);
          return {
            role: roleOf(control) || 'button',
            name: nameOf(control)[0],
            title: clean(control.getAttribute('title')) || undefined,
            testId: clean(control.getAttribute('data-testid')) || undefined,
            iconText: raw && raw.length <= 3 ? raw : control.querySelector('svg, img, i') ? control.querySelector('svg, img, i')?.tagName.toLowerCase() : undefined,
          };
        })
      : [];
    tables.push({
      index,
      name,
      headers: headerCells.map((cell) => clean(textOf(cell))),
      rowCount: rows.length,
      sampleRows: rows.slice(0, 5).map((row) => [...row.querySelectorAll('td, [role="cell"], [role="gridcell"]')].map((cell) => clean(textOf(cell)))),
      firstRowControls,
    });
  });

  const contentLinks = [...document.querySelectorAll('main a[href], [role="main"] a[href]')]
    .filter((el) => visibleEl(el) && !inRow(el) && !isNav(el) && !inBreadcrumbs(el))
    .map((el) => ({ name: nameOf(el)[0], href: (el as HTMLAnchorElement).href, opensPopup: (el as HTMLAnchorElement).target === '_blank' }));

  const crumbNav = [...document.querySelectorAll('nav, [role="navigation"]')].find((nav) => BREADCRUMB.test(nav.getAttribute('aria-label') ?? ''));
  return {
    title: document.title,
    headings: [...document.querySelectorAll('h1, h2, [role="heading"]')].filter(visibleEl).map((el) => clean(textOf(el))).filter(Boolean),
    breadcrumbs: crumbNav ? [...crumbNav.querySelectorAll('li, a')].map((el) => clean(textOf(el))).filter(Boolean) : [],
    dialogs: [...document.querySelectorAll('dialog[open], [role="dialog"], [role="alertdialog"]')].filter(visibleEl).map((el) => nameOf(el)[0]),
    elements,
    tables,
    contentLinks,
  };
}

function collectNavLinks(): RawNavLink[] {
  const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
  const BREADCRUMB = /breadcrumb|ruta de navegaci|migas/i;
  const textOf = (el: Element): string => {
    let out = '';
    el.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) out += child.textContent ?? '';
      else if (child instanceof Element && child.getAttribute('aria-hidden') !== 'true') out += ` ${textOf(child)}`;
    });
    return out;
  };
  const nameOf = (el: Element) => clean(el.getAttribute('aria-label')) || clean(textOf(el)) || clean(el.getAttribute('title'));
  const LIST = 'UL, OL, [role="menu"], [role="group"], [role="tree"], [role="list"]';
  const links: RawNavLink[] = [];
  document.querySelectorAll('nav, [role="navigation"]').forEach((landmark) => {
    if (BREADCRUMB.test(landmark.getAttribute('aria-label') ?? '')) return;
    landmark.querySelectorAll('a[href], [role="menuitem"][href]').forEach((link) => {
      const rect = link.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const path = [nameOf(link)];
      let cursor = link.parentElement;
      while (cursor && cursor !== landmark) {
        if (cursor.matches(LIST)) {
          let label = '';
          if (cursor.id) {
            const control = landmark.querySelector(`[aria-controls~="${CSS.escape(cursor.id)}"]`);
            if (control) label = nameOf(control);
          }
          if (!label) {
            let sibling = cursor.previousElementSibling;
            while (sibling && !label) {
              if (sibling.matches('button, summary, [aria-expanded], [aria-haspopup], span, a:not([href])')) label = nameOf(sibling);
              sibling = sibling.previousElementSibling;
            }
          }
          if (label && label !== path[0]) path.unshift(label);
        }
        cursor = cursor.parentElement;
      }
      if (path[0]) links.push({ path, href: (link as HTMLAnchorElement).href });
    });
  });
  return links;
}

// --- Node side ---------------------------------------------------------------------------

export interface ExploreOptions {
  baseUrl: string;
  startPath: string;
  allowedOrigins: string[];
  storageStatePath?: string;
  extraRoutes?: string[];
  maxPages?: number;
  maxStates?: number;
  deadlineMs?: number;
  headless?: boolean;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
}

export interface DomExploration {
  pages: ObservedPage[];
  navObservations: NavObservation[];
  warnings: string[];
  routeHeadings: Map<string, string[]>;
  routeBreadcrumbs: Map<string, string[]>;
}

const NAME_ROLES = new Set(Object.values(TARGET_KINDS).map((kind) => kind.role).filter(Boolean) as string[]);
const SAFE_ROW_ACTION = /^(editar|ver|detalle|detalles|abrir|consultar|modificar|visualizar|mostrar)\b/i;
const MEANINGFUL = /[\p{L}\p{N}]/u;

function candidatesFor(raw: RawElement): Target[] {
  const targets: Target[] = [];
  const role = raw.role === 'searchbox' ? 'textbox' : raw.role;
  if (raw.name && NAME_ROLES.has(role) && MEANINGFUL.test(raw.name)) targets.push({ kind: role as TargetKind, value: raw.name });
  if (raw.label) targets.push({ kind: 'label', value: raw.label });
  if (raw.placeholder) targets.push({ kind: 'placeholder', value: raw.placeholder });
  if (raw.text && (raw.role === 'heading' || raw.role === 'status' || raw.role === 'alert')) targets.push({ kind: 'text', value: raw.text });
  if (raw.testId) targets.push({ kind: 'testId', value: raw.testId });
  if (raw.title) targets.push({ kind: 'title', value: raw.title });
  return targets.filter((target) => target.value.length <= 200 && !target.value.includes('"'));
}

async function countCandidates(page: Page, targets: Target[]): Promise<LocatorCandidate[]> {
  const result: LocatorCandidate[] = [];
  for (const target of targets) {
    const count = await visible(locatorFor(page, target)).count().catch(() => 0);
    // A candidate Playwright cannot find would fail at run time: drop it.
    if (count > 0) result.push({ target, count });
  }
  return result;
}

function routeOf(url: string): string {
  const parsed = new URL(url);
  return parsed.pathname;
}

function pageIdFor(kind: 'page' | 'state', key: string): string {
  return `${kind}-${slugify(key, 60) || 'inicio'}`;
}

function rowControlFrom(raw: RawRowControl, rowValues: string[], headers: string[], tableId: string, index: number): RowControl {
  const hasAccessibleName = MEANINGFUL.test(raw.name);
  let baseName = hasAccessibleName ? raw.name : '';
  let nameIncludesColumn: string | undefined;
  rowValues.forEach((value, column) => {
    if (!value || !baseName) return;
    const normalizedName = normalizeText(baseName);
    const normalizedValue = normalizeText(value);
    if (normalizedValue && normalizedName.endsWith(` ${normalizedValue}`)) {
      baseName = baseName.slice(0, baseName.length - value.length).trim();
      nameIncludesColumn = headers[column];
    }
  });
  let target: Target | null = null;
  if (hasAccessibleName) target = { kind: raw.role === 'link' ? 'link' : raw.role === 'menuitem' ? 'menuitem' : 'button', value: baseName || raw.name };
  else if (raw.title && MEANINGFUL.test(raw.title)) target = { kind: 'title', value: raw.title };
  else if (raw.testId) target = { kind: 'testId', value: raw.testId };
  return { id: `${tableId}:c${index + 1}`, role: raw.role, observedName: raw.name, baseName, nameIncludesColumn, title: raw.title, testId: raw.testId, iconText: raw.iconText, hasAccessibleName, target };
}

export class DomExplorer {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private readonly warnings: string[] = [];
  private readonly options: ExploreOptions;

  constructor(options: ExploreOptions) {
    this.options = options;
  }

  private progress(message: string): void {
    this.options.onProgress?.(message);
  }

  private checkBudget(deadline: number): boolean {
    if (this.options.signal?.aborted) throw new Error('Exploración cancelada.');
    return Date.now() < deadline;
  }

  async run(): Promise<DomExploration> {
    const { baseUrl, startPath, allowedOrigins } = this.options;
    const deadline = Date.now() + (this.options.deadlineMs ?? 120_000);
    const maxPages = this.options.maxPages ?? 25;
    const maxStates = this.options.maxStates ?? 20;
    this.browser = await chromium.launch({ headless: this.options.headless ?? true });
    try {
      this.context = await this.browser.newContext({ storageState: this.options.storageStatePath, viewport: { width: 1366, height: 900 } });
      await this.context.route('**/*', (route) => (isAllowedOrigin(route.request().url(), allowedOrigins) || route.request().url().startsWith('data:') ? route.continue() : route.abort('blockedbyclient')));
      const page = await this.context.newPage();
      page.setDefaultTimeout(10_000);
      const startUrl = new URL(startPath, baseUrl).href;
      this.progress(`Abriendo ${startUrl}`);
      await this.open(page, startUrl);

      const navObservations = await this.discoverNavigation(page, deadline);
      const routes = new Set<string>([routeOf(startUrl)]);
      for (const observation of navObservations) if (observation.route) routes.add(observation.route);
      for (const route of this.options.extraRoutes ?? []) routes.add(route);

      const pages: ObservedPage[] = [];
      const routeHeadings = new Map<string, string[]>();
      const routeBreadcrumbs = new Map<string, string[]>();
      const visitedStates = new Set<string>();
      let states = 0;
      for (const route of [...routes].slice(0, maxPages)) {
        if (!this.checkBudget(deadline)) {
          this.warnings.push(`Exploración detenida por tiempo; quedaron rutas sin visitar desde ${route}.`);
          break;
        }
        const url = new URL(route, baseUrl).href;
        if (!isAllowedOrigin(url, allowedOrigins)) continue;
        this.progress(`Explorando ${route}`);
        if (!(await this.open(page, url))) continue;
        const observed = await this.observe(page, 'page', pageIdFor('page', route));
        pages.push(observed.page);
        routeHeadings.set(route, observed.page.headings);
        routeBreadcrumbs.set(route, observed.page.breadcrumbs);

        // States reachable without side effects: safe row actions and in-content links.
        const stateTriggers: { label: string; act: () => Promise<void> }[] = [];
        for (const table of observed.page.tables) {
          for (const control of table.rowControls) {
            if (!control.target) continue;
            if (riskOfControlName(control.baseName || control.title || '') !== 'read' || !SAFE_ROW_ACTION.test(control.baseName || control.title || '')) continue;
            const tableIndex = observed.page.tables.indexOf(table);
            stateTriggers.push({
              label: `${control.baseName || control.title} (primera fila de ${table.name || 'la tabla'})`,
              act: async () => {
                const row = page.locator('table, [role="table"], [role="grid"]').nth(tableIndex).getByRole('row').filter({ has: page.getByRole('cell') }).first();
                await visible(locatorFor(row, control.target as Target, { inRow: true })).first().click();
                control.explored = { stateId: '', outcome: 'clicked' };
              },
            });
          }
        }
        for (const link of observed.contentRoutes) {
          if (routes.has(link.route) || riskOfControlName(link.name) !== 'read') continue;
          stateTriggers.push({ label: link.name, act: async () => void (await this.open(page, new URL(link.route, baseUrl).href)) });
        }

        for (const trigger of stateTriggers) {
          if (states >= maxStates || !this.checkBudget(deadline)) break;
          const key = `${route} ${trigger.label}`;
          if (visitedStates.has(key)) continue;
          visitedStates.add(key);
          try {
            await trigger.act();
            await page.waitForLoadState('domcontentloaded');
            await page.waitForTimeout(250);
            const state = await this.observe(page, 'state', pageIdFor('state', key));
            state.page.parentPageId = observed.page.id;
            state.page.trigger = trigger.label;
            state.page.navNodeId = null;
            for (const table of observed.page.tables) for (const control of table.rowControls) if (control.explored && !control.explored.stateId) control.explored = { stateId: state.page.id, outcome: `Abre ${state.page.headings[0] ?? routeOf(page.url())}` };
            pages.push(state.page);
            states += 1;
          } catch (error) {
            this.warnings.push(`No se pudo explorar "${trigger.label}" en ${route}: ${(error as Error).message.split('\n')[0]}`);
          }
          await this.open(page, url);
        }
      }
      return { pages, navObservations, warnings: this.warnings, routeHeadings, routeBreadcrumbs };
    } finally {
      await this.browser.close().catch(() => undefined);
    }
  }

  private async open(page: Page, url: string): Promise<boolean> {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
      await page.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => undefined);
      return true;
    } catch (error) {
      this.warnings.push(`No se pudo abrir ${url}: ${(error as Error).message.split('\n')[0]}`);
      return false;
    }
  }

  /** Expands collapsed menu groups (aria-expanded=false) and records every menu link with its group path. */
  private async discoverNavigation(page: Page, deadline: number): Promise<NavObservation[]> {
    const found = new Map<string, NavObservation>();
    const record = async () => {
      for (const link of await page.evaluate(collectNavLinks)) {
        if (!isAllowedOrigin(link.href, this.options.allowedOrigins)) continue;
        const observation: NavObservation = { path: link.path, route: routeOf(link.href), control: 'link', url: page.url(), source: 'playwright-dom' };
        found.set(`${link.path.join('>')}|${observation.route}`, observation);
      }
    };
    await record();
    const clicked = new Set<string>();
    for (let round = 0; round < 40 && this.checkBudget(deadline); round += 1) {
      const collapsed = page.locator('nav [aria-expanded="false"], [role="navigation"] [aria-expanded="false"]').filter({ visible: true });
      const count = await collapsed.count();
      let next = -1;
      let name = '';
      for (let index = 0; index < count; index += 1) {
        const candidate = await collapsed.nth(index).evaluate((el) => `${el.getAttribute('aria-controls') ?? ''}|${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim()}`);
        if (!clicked.has(candidate)) {
          next = index;
          name = candidate;
          break;
        }
      }
      if (next === -1) break;
      clicked.add(name);
      if (riskOfControlName(name) !== 'read') continue;
      await collapsed.nth(next).click().catch((error: Error) => this.warnings.push(`No se pudo expandir el grupo ${name}: ${error.message.split('\n')[0]}`));
      await page.waitForTimeout(150);
      await record();
    }
    return [...found.values()];
  }

  private async observe(page: Page, kind: 'page' | 'state', id: string): Promise<{ page: ObservedPage; contentRoutes: { name: string; route: string }[] }> {
    const raw = await page.evaluate(collectPage);
    const url = page.url();
    const observedAt = new Date().toISOString();
    const evidence = { source: 'playwright-dom' as const, url, observedAt };
    const elements: ObservedElement[] = [];
    for (const [index, item] of raw.elements.slice(0, 80).entries()) {
      const locators = await countCandidates(page, candidatesFor(item));
      if (!locators.length) continue;
      elements.push({
        id: `${id}:e${index + 1}`,
        pageId: id,
        role: item.role,
        name: item.name,
        nameSource: item.nameSource,
        tag: item.tag,
        inputType: item.inputType,
        label: item.label,
        placeholder: item.placeholder,
        testId: item.testId,
        title: item.title,
        text: item.text,
        href: item.href ? routeOf(item.href) : undefined,
        opensPopup: item.opensPopup || undefined,
        inNavigation: item.inNavigation,
        visible: true,
        locators,
        evidence,
      });
    }
    const tables: ObservedTable[] = [];
    for (const table of raw.tables) {
      const tableId = `${id}:t${table.index + 1}`;
      const rowValues = table.sampleRows[0] ?? [];
      const rowControls = table.firstRowControls.map((control, index) => rowControlFrom(control, rowValues, table.headers, tableId, index));
      const row = page.locator('table, [role="table"], [role="grid"]').nth(table.index).getByRole('row').filter({ has: page.getByRole('cell') }).first();
      for (const control of rowControls) {
        if (!control.target) {
          this.warnings.push(`Tabla "${table.name || table.index + 1}" en ${routeOf(url)}: un control de fila (${control.iconText ?? 'icono'}) no tiene nombre accesible, título ni test id; no se exploró ni se usará sin aclaración.`);
          continue;
        }
        const count = await visible(locatorFor(row, control.target, { inRow: true })).count().catch(() => 0);
        if (count !== 1) {
          this.warnings.push(`Tabla "${table.name}" en ${routeOf(url)}: el control "${control.target.value}" coincide ${count} veces dentro de una fila; no se usará.`);
          control.target = null;
        }
      }
      tables.push({ id: tableId, pageId: id, name: table.name, headers: table.headers, rowCount: table.rowCount, sampleRows: table.sampleRows, rowControls, evidence });
    }
    const contentRoutes = raw.contentLinks
      .filter((link) => !link.opensPopup && link.name && isAllowedOrigin(link.href, this.options.allowedOrigins))
      .map((link) => ({ name: link.name, route: routeOf(link.href) }));
    return {
      page: { id, kind, url, path: routeOf(url), title: raw.title, headings: raw.headings, breadcrumbs: raw.breadcrumbs.map((crumb) => crumb.replace(/^[/>›»]\s*/, '')), navNodeId: null, elements, tables, dialogs: raw.dialogs, observedAt, source: 'playwright-dom' },
      contentRoutes,
    };
  }
}
