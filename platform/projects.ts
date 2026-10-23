import { DomExplorer } from './explorer.ts';
import { randomId } from './hash.ts';
import { allElements, allTables, type Inventory, type McpReport } from './inventory.ts';
import { exploreWithMcp, type McpExploration } from './mcp-explorer.ts';
import { buildNavigation, nodeForRoute, type NavigationMap } from './navigation.ts';
import { normalizeProjectUrl, ProjectInputSchema, publicProject, type Project, type ProjectInput } from './project.ts';
import { assertSafeId, SecurityError } from './security.ts';
import type { WorkspaceStore } from './store.ts';
import { sameName, slugify } from './text.ts';

export class NotFoundError extends Error {
  override name = 'NotFoundError';
}

export class ConflictError extends Error {
  override name = 'ConflictError';
}

export interface ProjectServiceOptions {
  mcpEnabled: boolean;
  env?: NodeJS.ProcessEnv;
  headless?: boolean;
}

export class ProjectService {
  private readonly exploring = new Set<string>();
  private readonly store: WorkspaceStore;
  private readonly options: ProjectServiceOptions;

  constructor(store: WorkspaceStore, options: ProjectServiceOptions) {
    this.store = store;
    this.options = options;
  }

  async list(): Promise<ReturnType<typeof publicProject>[]> {
    const ids = await this.store.listDirs('projects');
    const projects = await Promise.all(ids.map((id) => this.store.readJson<Project>('projects', id, 'project.json')));
    const present = projects.filter((project): project is Project => Boolean(project));
    return Promise.all(present.map(async (project) => publicProject(project, { authStateAvailable: await this.authStateAvailable(project.id) })));
  }

  async create(input: ProjectInput): Promise<Project> {
    const parsed = ProjectInputSchema.parse(input);
    const env = this.options.env ?? process.env;
    if (parsed.environment === 'production' && env.QA_ALLOW_PRODUCTION !== '1') {
      throw new SecurityError('Los proyectos de producción están deshabilitados. Define QA_ALLOW_PRODUCTION=1 en el servidor para permitirlos (solo lectura).');
    }
    const { baseUrl, startPath, origin } = normalizeProjectUrl(parsed.url, env);
    const id = randomId(slugify(parsed.name, 30) || 'proyecto');
    const now = new Date().toISOString();
    const project: Project = { id, name: parsed.name, baseUrl, startPath, allowedOrigins: [origin], environment: parsed.environment, auth: { mode: parsed.authMode }, createdAt: now, updatedAt: now };
    await this.store.createExclusive(['projects', id, 'project.json'], `${JSON.stringify(project, null, 2)}\n`);
    return project;
  }

  async get(projectId: string): Promise<Project> {
    const project = await this.store.readJson<Project>('projects', assertSafeId(projectId, 'proyecto'), 'project.json');
    if (!project) throw new NotFoundError(`El proyecto ${projectId} no existe.`);
    return project;
  }

  async details(projectId: string) {
    const project = await this.get(projectId);
    const [inventory, navigation] = await Promise.all([this.inventory(projectId), this.navigation(projectId)]);
    return {
      project: publicProject(project, { authStateAvailable: await this.authStateAvailable(projectId) }),
      exploring: this.exploring.has(projectId),
      inventory: inventory && summarizeInventory(inventory),
      navigation,
    };
  }

  inventory(projectId: string): Promise<Inventory | null> {
    return this.store.readJson<Inventory>('projects', assertSafeId(projectId, 'proyecto'), 'inventory.json');
  }

  navigation(projectId: string): Promise<NavigationMap | null> {
    return this.store.readJson<NavigationMap>('projects', assertSafeId(projectId, 'proyecto'), 'navigation.json');
  }

  storageStatePath(projectId: string): string {
    return this.store.resolve('projects', assertSafeId(projectId, 'proyecto'), 'auth', 'storage-state.json');
  }

  authStateAvailable(projectId: string): Promise<boolean> {
    return this.store.exists('projects', assertSafeId(projectId, 'proyecto'), 'auth', 'storage-state.json');
  }

  /** Explores the target with the real Playwright MCP server (when enabled) and direct Playwright, then persists inventory and navigation. */
  async explore(projectId: string, onProgress?: (message: string) => void): Promise<{ inventory: Inventory; navigation: NavigationMap }> {
    const project = await this.get(projectId);
    if (this.exploring.has(projectId)) throw new ConflictError('Ya hay una exploración en curso para este proyecto.');
    this.exploring.add(projectId);
    try {
      const storageStatePath = project.auth.mode === 'storage-state' && (await this.authStateAvailable(projectId)) ? this.storageStatePath(projectId) : undefined;
      if (project.auth.mode === 'storage-state' && !storageStatePath) onProgress?.('Aviso: el proyecto requiere sesión y no hay estado de autenticación; se explorará sin sesión.');
      const exploredAt = new Date().toISOString();
      const evidenceDir = ['projects', projectId, 'evidence', exploredAt.replace(/[:.]/g, '-')];

      let mcp: McpExploration;
      if (this.options.mcpEnabled) {
        mcp = await exploreWithMcp({ baseUrl: project.baseUrl, startPath: project.startPath, allowedOrigins: project.allowedOrigins, outputDir: await this.store.ensureDir(...evidenceDir, 'mcp-output'), storageStatePath, onProgress });
      } else {
        mcp = { report: { used: false, reason: 'MCP desactivado (QA_MCP_ENABLED=0).', toolsAvailable: [], calls: [], pagesSnapshotted: 0, navLinks: 0, unmatched: 0 }, navObservations: [], snapshots: [] };
      }

      const dom = await new DomExplorer({
        baseUrl: project.baseUrl,
        startPath: project.startPath,
        allowedOrigins: project.allowedOrigins,
        storageStatePath,
        extraRoutes: mcp.navObservations.map((observation) => observation.route).filter((route): route is string => Boolean(route)),
        headless: this.options.headless ?? true,
        onProgress,
      }).run();

      const previous = await this.navigation(projectId);
      const navigation = buildNavigation(projectId, [...dom.navObservations, ...mcp.navObservations], previous, exploredAt, { routeHeadings: dom.routeHeadings, routeBreadcrumbs: dom.routeBreadcrumbs });
      for (const page of dom.pages) if (page.kind === 'page') page.navNodeId = nodeForRoute(navigation, page.path)?.id ?? null;

      const warnings = [...dom.warnings];
      if (!mcp.report.used) warnings.push(`Exploración sin MCP: ${mcp.report.reason ?? 'no disponible'}. El inventario procede solo de Playwright directo.`);
      await this.attachMcpEvidence(mcp, dom.pages, evidenceDir, warnings);

      const inventory: Inventory = { projectId, exploredAt, source: 'playwright-dom', baseUrl: project.baseUrl, pages: dom.pages, warnings, mcp: mcp.report };
      await this.store.writeJson(['projects', projectId, 'inventory.json'], inventory);
      await this.store.writeJson(['projects', projectId, 'navigation.json'], navigation);
      return { inventory, navigation };
    } finally {
      this.exploring.delete(projectId);
    }
  }

  private async attachMcpEvidence(mcp: McpExploration, pages: Inventory['pages'], evidenceDir: string[], warnings: string[]): Promise<void> {
    let unmatched = 0;
    for (const [index, snapshot] of mcp.snapshots.entries()) {
      const file = [...evidenceDir, `mcp-${String(index + 1).padStart(2, '0')}-${slugify(snapshot.route, 40) || 'inicio'}.yml`];
      await this.store.createExclusive(file, snapshot.yaml);
      const page = pages.find((candidate) => candidate.kind === 'page' && candidate.path === snapshot.route);
      if (!page) {
        warnings.push(`MCP observó ${snapshot.route}, pero Playwright directo no pudo inventariarla.`);
        continue;
      }
      page.mcpSnapshot = file.join('/');
      const known = [...page.elements.map((element) => ({ role: element.role === 'searchbox' ? 'textbox' : element.role, name: element.name })), ...page.tables.flatMap((table) => table.rowControls.map((control) => ({ role: control.role, name: control.observedName })))];
      const missing = snapshot.elements.filter((element) => element.name && !known.some((item) => item.role === element.role && sameName(item.name, element.name)));
      unmatched += missing.length;
      if (missing.length) warnings.push(`MCP vio en ${snapshot.route} elementos no inventariados por el DOM: ${missing.slice(0, 5).map((item) => `${item.role} "${item.name}"`).join(', ')}${missing.length > 5 ? '…' : ''}`);
    }
    mcp.report.unmatched = unmatched;
  }
}

export function summarizeInventory(inventory: Inventory) {
  return {
    exploredAt: inventory.exploredAt,
    pages: inventory.pages.map((page) => ({
      id: page.id,
      kind: page.kind,
      path: page.path,
      title: page.headings[0] ?? page.title,
      trigger: page.trigger,
      parentPageId: page.parentPageId,
      navNodeId: page.navNodeId,
      elements: page.elements.length,
      tables: page.tables.map((table) => ({ name: table.name, headers: table.headers, rows: table.rowCount, controls: table.rowControls.map((control) => ({ name: control.baseName || control.observedName || control.title || control.iconText || '(sin nombre)', usable: Boolean(control.target) })) })),
      mcpSnapshot: Boolean(page.mcpSnapshot),
    })),
    elementCount: allElements(inventory).length,
    tableCount: allTables(inventory).length,
    warnings: inventory.warnings,
    mcp: inventory.mcp satisfies McpReport,
  };
}
