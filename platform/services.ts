import { loadConfig, type PlatformConfig } from './config.ts';
import { generatePlan, OllamaPlannerProvider, type PlannerProvider } from './planner.ts';
import { randomId } from './hash.ts';
import type { Plan, StoryInput } from './plan.ts';
import { StoryInputSchema } from './plan.ts';
import { NotFoundError, ProjectService } from './projects.ts';
import { RunManager } from './runs.ts';
import { ScenarioService } from './scenarios.ts';
import { assertSafeId } from './security.ts';
import { WorkspaceStore } from './store.ts';

export interface StoredPlan {
  planId: string;
  projectId: string;
  createdAt: string;
  plan: Plan;
  attempts: unknown[];
}

export class PlanService {
  private readonly store: WorkspaceStore;
  private readonly projects: ProjectService;
  private readonly provider: PlannerProvider;
  private readonly maxAttempts: number;

  constructor(store: WorkspaceStore, projects: ProjectService, provider: PlannerProvider, maxAttempts: number) {
    this.store = store;
    this.projects = projects;
    this.provider = provider;
    this.maxAttempts = maxAttempts;
  }

  async create(projectId: string, rawInput: unknown): Promise<StoredPlan> {
    const input: StoryInput = StoryInputSchema.parse(rawInput);
    const project = await this.projects.get(projectId);
    const [inventory, navigation, authStateAvailable] = await Promise.all([this.projects.inventory(projectId), this.projects.navigation(projectId), this.projects.authStateAvailable(projectId)]);
    const { plan, attempts } = await generatePlan(input, { project, inventory, navigation, authStateAvailable }, this.provider, this.maxAttempts);
    const stored: StoredPlan = { planId: randomId('plan'), projectId, createdAt: new Date().toISOString(), plan, attempts };
    await this.store.createExclusive(['projects', projectId, 'plans', `${stored.planId}.json`], `${JSON.stringify(stored, null, 2)}\n`);
    return stored;
  }

  async get(projectId: string, planId: string): Promise<StoredPlan> {
    const stored = await this.store.readJson<StoredPlan>('projects', assertSafeId(projectId, 'proyecto'), 'plans', `${assertSafeId(planId, 'plan')}.json`);
    if (!stored) throw new NotFoundError(`El plan ${planId} no existe.`);
    return stored;
  }
}

export interface Platform {
  config: PlatformConfig;
  store: WorkspaceStore;
  projects: ProjectService;
  scenarios: ScenarioService;
  runs: RunManager;
  plans: PlanService;
  provider: PlannerProvider & { status?: () => Promise<unknown> };
}

export function createPlatform(env: NodeJS.ProcessEnv = process.env, overrides: { provider?: PlannerProvider } = {}): Platform {
  const config = loadConfig(env);
  const store = new WorkspaceStore(config.workspace);
  const projects = new ProjectService(store, { mcpEnabled: config.mcp.enabled, env });
  const scenarios = new ScenarioService(store, projects);
  const runs = new RunManager(store, scenarios, projects, { ...config.runs });
  const provider = overrides.provider ?? new OllamaPlannerProvider({ ...config.ollama });
  const plans = new PlanService(store, projects, provider, config.ollama.maxAttempts);
  return { config, store, projects, scenarios, runs, plans, provider };
}
