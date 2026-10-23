import { CATALOG_VERSION, GENERATOR_VERSION, RISK_ORDER, type RiskLevel } from './catalog.ts';
import { cucumberDryRun, type DryRunResult } from './cucumber-check.ts';
import { generateFeature, validateFeature, type FeatureValidation } from './gherkin.ts';
import { canonicalFeature, randomId, sha256 } from './hash.ts';
import type { Plan, StoryInput } from './plan.ts';
import type { Project } from './project.ts';
import { ConflictError, NotFoundError, type ProjectService } from './projects.ts';
import { assertSafeId, SecurityError } from './security.ts';
import type { WorkspaceStore } from './store.ts';

/**
 * Scenario storage:
 *   projects/<pid>/scenarios/<sid>/manifest.json        mutable index
 *   projects/<pid>/scenarios/<sid>/versions/v0001.feature   immutable bytes (canonical)
 *   projects/<pid>/scenarios/<sid>/versions/v0001.json      immutable metadata
 *   projects/<pid>/scenarios/<sid>/versions/v0001.approval.json  immutable approval
 * Editing never rewrites a version: every change is a new version.
 */

export type VersionSource = 'generated' | 'edited' | 'regenerated';

export interface VersionRecord {
  scenarioId: string;
  projectId: string;
  version: number;
  hash: string;
  source: VersionSource;
  parentVersion: number | null;
  createdAt: string;
  catalogVersion: string;
  generatorVersion: string;
  story: StoryInput | null;
  plan: Plan | null;
  validation: FeatureValidation;
}

export interface ApprovalRecord {
  scenarioId: string;
  version: number;
  hash: string;
  approvedAt: string;
  catalogVersion: string;
  risk: RiskLevel;
  authorizedRisk: boolean;
  dryRun: DryRunResult;
}

export interface VersionSummary {
  version: number;
  hash: string;
  source: VersionSource;
  parentVersion: number | null;
  createdAt: string;
  valid: boolean;
  risk: RiskLevel;
  approved: boolean;
  approvedAt?: string;
}

export interface ScenarioManifest {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  latestVersion: number;
  approvedVersion: number | null;
  versions: VersionSummary[];
}

export class ApprovalError extends Error {
  override name = 'ApprovalError';
  readonly details: unknown;
  constructor(message: string, details?: unknown) {
    super(message);
    this.details = details;
  }
}

const versionFile = (version: number) => `v${String(version).padStart(4, '0')}`;

export class ScenarioService {
  private readonly store: WorkspaceStore;
  private readonly projects: ProjectService;
  private readonly dryRun: typeof cucumberDryRun;

  constructor(store: WorkspaceStore, projects: ProjectService, dryRun: typeof cucumberDryRun = cucumberDryRun) {
    this.store = store;
    this.projects = projects;
    this.dryRun = dryRun;
  }

  private dir(projectId: string, scenarioId: string): string[] {
    return ['projects', assertSafeId(projectId, 'proyecto'), 'scenarios', assertSafeId(scenarioId, 'escenario')];
  }

  async list(projectId: string): Promise<ScenarioManifest[]> {
    await this.projects.get(projectId);
    const ids = await this.store.listDirs('projects', projectId, 'scenarios');
    const manifests = await Promise.all(ids.map((id) => this.store.readJson<ScenarioManifest>(...this.dir(projectId, id), 'manifest.json')));
    return manifests.filter((manifest): manifest is ScenarioManifest => Boolean(manifest)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async manifest(projectId: string, scenarioId: string): Promise<ScenarioManifest> {
    const manifest = await this.store.readJson<ScenarioManifest>(...this.dir(projectId, scenarioId), 'manifest.json');
    if (!manifest) throw new NotFoundError(`El escenario ${scenarioId} no existe.`);
    return manifest;
  }

  async version(projectId: string, scenarioId: string, version: number): Promise<{ record: VersionRecord; text: string; approval: ApprovalRecord | null }> {
    if (!Number.isInteger(version) || version < 1) throw new NotFoundError('Versión inválida.');
    const base = [...this.dir(projectId, scenarioId), 'versions'];
    const [record, text, approval] = await Promise.all([
      this.store.readJson<VersionRecord>(...base, `${versionFile(version)}.json`),
      this.store.readText(...base, `${versionFile(version)}.feature`),
      this.store.readJson<ApprovalRecord>(...base, `${versionFile(version)}.approval.json`),
    ]);
    if (!record || text === null) throw new NotFoundError(`La versión ${version} no existe.`);
    return { record, text, approval };
  }

  async validationContext(project: Project, plan: Plan | null) {
    const [navigation, inventory, authStateAvailable] = await Promise.all([this.projects.navigation(project.id), this.projects.inventory(project.id), this.projects.authStateAvailable(project.id)]);
    return { project, navigation, inventory, authStateAvailable, plan };
  }

  async validate(projectId: string, text: string, plan: Plan | null = null): Promise<FeatureValidation> {
    const project = await this.projects.get(projectId);
    return validateFeature(text, await this.validationContext(project, plan));
  }

  /** Creates a scenario from a plan; the feature is generated deterministically from the catalog. */
  async createFromPlan(projectId: string, plan: Plan, story: StoryInput | null): Promise<{ manifest: ScenarioManifest; version: VersionRecord; text: string }> {
    const project = await this.projects.get(projectId);
    const scenarioId = randomId('esc');
    const now = new Date().toISOString();
    const manifest: ScenarioManifest = { id: scenarioId, projectId, title: plan.title, createdAt: now, updatedAt: now, latestVersion: 0, approvedVersion: null, versions: [] };
    await this.store.createExclusive([...this.dir(projectId, scenarioId), 'manifest.json'], `${JSON.stringify(manifest, null, 2)}\n`);
    return this.addVersion(project, scenarioId, generateFeature(plan, project), { source: 'generated', plan, story, parentVersion: null });
  }

  /** Creates a scenario from Gherkin written by hand; it is validated like any edited version. */
  async createFromText(projectId: string, text: string): Promise<{ manifest: ScenarioManifest; version: VersionRecord; text: string }> {
    const project = await this.projects.get(projectId);
    const scenarioId = randomId('esc');
    const now = new Date().toISOString();
    const title = validateFeature(text).featureName || 'Escenario manual';
    const manifest: ScenarioManifest = { id: scenarioId, projectId, title, createdAt: now, updatedAt: now, latestVersion: 0, approvedVersion: null, versions: [] };
    await this.store.createExclusive([...this.dir(projectId, scenarioId), 'manifest.json'], `${JSON.stringify(manifest, null, 2)}\n`);
    return this.addVersion(project, scenarioId, text, { source: 'edited', plan: null, story: null, parentVersion: null });
  }

  /** Saves edited text as a new version. Identical bytes return the existing latest version. */
  async saveEdited(projectId: string, scenarioId: string, text: string, parentVersion: number) {
    const project = await this.projects.get(projectId);
    const manifest = await this.manifest(projectId, scenarioId);
    if (parentVersion !== manifest.latestVersion) throw new ConflictError(`La versión base (${parentVersion}) ya no es la última (${manifest.latestVersion}); recarga antes de guardar.`);
    const latest = await this.version(projectId, scenarioId, manifest.latestVersion);
    const canonical = canonicalFeature(text);
    if (sha256(canonical) === latest.record.hash) return { manifest, version: latest.record, text: latest.text, unchanged: true };
    return { ...(await this.addVersion(project, scenarioId, canonical, { source: 'edited', plan: latest.record.plan, story: latest.record.story, parentVersion })), unchanged: false };
  }

  async regenerate(projectId: string, scenarioId: string, plan: Plan, story: StoryInput | null) {
    const project = await this.projects.get(projectId);
    const manifest = await this.manifest(projectId, scenarioId);
    return this.addVersion(project, scenarioId, generateFeature(plan, project), { source: 'regenerated', plan, story, parentVersion: manifest.latestVersion });
  }

  private async addVersion(project: Project, scenarioId: string, rawText: string, meta: { source: VersionSource; plan: Plan | null; story: StoryInput | null; parentVersion: number | null }) {
    const text = canonicalFeature(rawText);
    const validation = validateFeature(text, await this.validationContext(project, meta.plan));
    const base = this.dir(project.id, scenarioId);
    let record: VersionRecord | null = null;
    const manifest = await this.store.update<ScenarioManifest>([...base, 'manifest.json'], async (current) => {
      if (!current) throw new NotFoundError(`El escenario ${scenarioId} no existe.`);
      const version = current.latestVersion + 1;
      record = {
        scenarioId,
        projectId: project.id,
        version,
        hash: sha256(text),
        source: meta.source,
        parentVersion: meta.parentVersion,
        createdAt: new Date().toISOString(),
        catalogVersion: CATALOG_VERSION,
        generatorVersion: GENERATOR_VERSION,
        story: meta.story,
        plan: meta.plan,
        validation,
      };
      await this.store.createExclusive([...base, 'versions', `${versionFile(version)}.feature`], text);
      await this.store.createExclusive([...base, 'versions', `${versionFile(version)}.json`], `${JSON.stringify(record, null, 2)}\n`);
      const summary: VersionSummary = { version, hash: record.hash, source: meta.source, parentVersion: meta.parentVersion, createdAt: record.createdAt, valid: validation.valid, risk: validation.risk.level, approved: false };
      return { ...current, title: meta.plan?.title ?? validation.featureName ?? current.title, latestVersion: version, updatedAt: record.createdAt, versions: [...current.versions, summary] };
    });
    return { manifest, version: record as unknown as VersionRecord, text };
  }

  /**
   * Approves an exact version. Requirements: the stored bytes still hash to the recorded
   * hash and to the hash the reviewer saw, validation passes now, a real Cucumber dry run binds
   * every step, generated plans are ready, and destructive steps carry explicit authorization.
   */
  async approve(projectId: string, scenarioId: string, version: number, input: { expectedHash: string; authorizeRisk?: boolean }) {
    const project = await this.projects.get(projectId);
    const { record, text, approval } = await this.version(projectId, scenarioId, version);
    if (approval) return { approval, alreadyApproved: true };
    const actualHash = sha256(canonicalFeature(text));
    if (actualHash !== record.hash) throw new SecurityError('El contenido almacenado de la versión no coincide con su hash; no se puede aprobar.');
    if (input.expectedHash !== actualHash) throw new ApprovalError('El escenario cambió desde que lo revisaste: el hash no coincide con la versión mostrada.', { expected: input.expectedHash, actual: actualHash });

    const validation = validateFeature(text, await this.validationContext(project, record.plan));
    if (!validation.valid) throw new ApprovalError('La versión no supera la validación actual.', { errors: validation.errors });
    if (record.source !== 'edited' && record.plan && record.plan.status !== 'ready') throw new ApprovalError('El plan tiene preguntas o capacidades pendientes; resuélvelas o edita el escenario antes de aprobar.', { questions: record.plan.questions, missing: record.plan.missingCapabilities });
    if (project.environment === 'production' && RISK_ORDER[validation.risk.level] > RISK_ORDER.read) throw new SecurityError('En producción solo se pueden aprobar escenarios de solo lectura.');
    if (validation.risk.level === 'destructive' && !input.authorizeRisk) throw new ApprovalError('El escenario contiene acciones destructivas; marca la autorización explícita para aprobarlo.', { reasons: validation.risk.reasons });

    const dryRun = await this.dryRun(text);
    if (!dryRun.ok) throw new ApprovalError('El dry-run de Cucumber encontró pasos sin implementación o ambiguos.', dryRun);

    const record2: ApprovalRecord = { scenarioId, version, hash: actualHash, approvedAt: new Date().toISOString(), catalogVersion: CATALOG_VERSION, risk: validation.risk.level, authorizedRisk: Boolean(input.authorizeRisk), dryRun };
    const base = this.dir(projectId, scenarioId);
    await this.store.createExclusive([...base, 'versions', `${versionFile(version)}.approval.json`], `${JSON.stringify(record2, null, 2)}\n`);
    await this.store.update<ScenarioManifest>([...base, 'manifest.json'], (current) => {
      if (!current) throw new NotFoundError(`El escenario ${scenarioId} no existe.`);
      return {
        ...current,
        approvedVersion: Math.max(current.approvedVersion ?? 0, version),
        updatedAt: record2.approvedAt,
        versions: current.versions.map((item) => (item.version === version ? { ...item, approved: true, approvedAt: record2.approvedAt } : item)),
      };
    });
    return { approval: record2, alreadyApproved: false };
  }

  /** Returns the exact approved bytes for execution after re-checking hash, approval and catalog. */
  async executable(projectId: string, scenarioId: string, version: number): Promise<{ project: Project; record: VersionRecord; approval: ApprovalRecord; text: string }> {
    const project = await this.projects.get(projectId);
    const { record, text, approval } = await this.version(projectId, scenarioId, version);
    if (!approval) throw new ApprovalError('Solo se pueden ejecutar versiones aprobadas.');
    const hash = sha256(canonicalFeature(text));
    if (hash !== record.hash || hash !== approval.hash) throw new SecurityError('El escenario fue modificado después de aprobarse (hash distinto); no se ejecutará.');
    if (approval.catalogVersion !== CATALOG_VERSION) {
      const validation = validateFeature(text, await this.validationContext(project, record.plan));
      if (!validation.valid) throw new ApprovalError(`El catálogo cambió (${approval.catalogVersion} → ${CATALOG_VERSION}) y la versión ya no es válida; genera y aprueba una nueva.`, { errors: validation.errors });
    }
    return { project, record, approval, text };
  }
}
