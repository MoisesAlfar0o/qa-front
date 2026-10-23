import { fork, type ChildProcess } from 'node:child_process';
import path from 'node:path';

import { RISK_ORDER, type RiskLevel } from './catalog.ts';
import { ROOT } from './config.ts';
import { randomId } from './hash.ts';
import { ConflictError, NotFoundError, type ProjectService } from './projects.ts';
import { EnvelopeAdapter, finalStatus, isTerminal, RunEventSchema, type RunEvent, type RunEventInput } from './run-events.ts';
import { emptyRun, foldRun, reduceRun, type RunView } from './run-state.ts';
import type { ScenarioService } from './scenarios.ts';
import { assertSafeId, redact } from './security.ts';
import type { WorkspaceStore } from './store.ts';

const RUNNER = path.join(ROOT, 'runner', 'run-scenario.ts');
const ARTIFACT_FILE = /^(screenshots\/step-\d{2,3}\.jpg|traces\/trace\.zip|report\.html|messages\.ndjson|runner\.log)$/;
const LOG_LIMIT = 64 * 1024;

export interface RunSummary extends RunView {
  projectId: string;
  requestId?: string;
  risk: RiskLevel;
  headed: boolean;
  exitCode?: number | null;
  evidencePruned?: boolean;
}

export interface RunManagerOptions {
  maxConcurrent: number;
  timeoutMs: number;
  cancelGraceMs: number;
  retention: number;
  actionTimeoutMs?: number;
  expectTimeoutMs?: number;
  trace?: boolean;
}

interface ActiveRun {
  summary: RunSummary;
  seq: number;
  child: ChildProcess | null;
  adapter: EnvelopeAdapter;
  jobPath: string;
  cancelRequested: boolean;
  timedOut: boolean;
  killedByManager: boolean;
  fatal: { code: string; message: string } | null;
  timers: NodeJS.Timeout[];
  log: string;
  chain: Promise<unknown>;
  finished: Promise<void>;
  resolveFinished: () => void;
}

type Listener = (event: RunEvent) => void;

export class BusyError extends Error {
  override name = 'BusyError';
}

export class RunManager {
  private readonly store: WorkspaceStore;
  private readonly scenarios: ScenarioService;
  private readonly projects: ProjectService;
  private readonly options: RunManagerOptions;
  private readonly active = new Map<string, ActiveRun>();
  private readonly queue: string[] = [];
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly requests = new Map<string, Promise<RunSummary>>();

  constructor(store: WorkspaceStore, scenarios: ScenarioService, projects: ProjectService, options: RunManagerOptions) {
    this.store = store;
    this.scenarios = scenarios;
    this.projects = projects;
    this.options = options;
  }

  private dir(projectId: string, runId: string): string[] {
    return ['projects', assertSafeId(projectId, 'proyecto'), 'runs', assertSafeId(runId, 'ejecución')];
  }

  /** Starts (or queues) a run of an approved version. A repeated requestId returns the original run. */
  start(projectId: string, scenarioId: string, version: number, input: { requestId?: string; headed?: boolean } = {}): Promise<RunSummary> {
    if (input.requestId && !/^[\w-]{8,80}$/.test(input.requestId)) return Promise.reject(new ConflictError('requestId inválido.'));
    const requestKey = input.requestId ? `${projectId}:${input.requestId}` : null;
    if (!requestKey) return this.create(projectId, scenarioId, version, input);
    const pending = this.requests.get(requestKey);
    if (pending) return pending.then((run) => this.get(projectId, run.runId));
    const created = (async () => {
      const existing = await this.findByRequest(projectId, input.requestId as string);
      return existing ? this.get(projectId, existing) : this.create(projectId, scenarioId, version, input);
    })();
    this.requests.set(requestKey, created);
    created.catch(() => this.requests.delete(requestKey));
    return created;
  }

  private async create(projectId: string, scenarioId: string, version: number, input: { requestId?: string; headed?: boolean }): Promise<RunSummary> {
    const { project, record, approval, text } = await this.scenarios.executable(projectId, scenarioId, version);
    if (this.queue.length >= this.options.maxConcurrent * 5) throw new BusyError('Hay demasiadas ejecuciones en cola; espera a que terminen.');

    const runId = randomId('run');
    const base = this.dir(projectId, runId);
    const runDir = await this.store.ensureDir(...base);
    await this.store.createExclusive([...base, 'scenario.feature'], text);
    const storageStatePath = project.auth.mode === 'storage-state' && (await this.projects.authStateAvailable(projectId)) ? this.projects.storageStatePath(projectId) : null;
    const runtime = {
      baseUrl: project.baseUrl,
      allowedOrigins: project.allowedOrigins,
      headless: !input.headed,
      navigation: await this.projects.navigation(projectId),
      storageStatePath,
      runDir,
      actionTimeoutMs: this.options.actionTimeoutMs ?? 10_000,
      expectTimeoutMs: this.options.expectTimeoutMs ?? 10_000,
      trace: this.options.trace ?? true,
    };
    await this.store.writeJson([...base, 'runtime.json'], { ...runtime, storageStatePath: storageStatePath ? '(estado de sesión del proyecto)' : null, navigation: runtime.navigation ? `${runtime.navigation.nodes.length} nodos` : null });
    const jobPath = this.store.resolve(...base, 'job.json');
    await this.store.writeJson([...base, 'job.json'], { featurePath: this.store.resolve(...base, 'scenario.feature'), expectedHash: approval.hash, runtime, messagesPath: this.store.resolve(...base, 'messages.ndjson'), reportPath: this.store.resolve(...base, 'report.html') });

    let resolveFinished = () => {};
    const finished = new Promise<void>((resolve) => {
      resolveFinished = resolve;
    });
    const run: ActiveRun = {
      summary: { ...emptyRun(runId), projectId, requestId: input.requestId, risk: approval.risk, headed: Boolean(input.headed) },
      seq: 0,
      child: null,
      adapter: new EnvelopeAdapter(),
      jobPath,
      cancelRequested: false,
      timedOut: false,
      killedByManager: false,
      fatal: null,
      timers: [],
      log: '',
      chain: Promise.resolve(),
      finished,
      resolveFinished,
    };
    this.active.set(runId, run);
    await this.emit(run, { type: 'run.created', scenarioId, version, hash: approval.hash, title: record.plan?.title ?? record.validation.featureName, requestId: input.requestId });
    await this.persist(run);
    this.queue.push(runId);
    this.pump();
    return run.summary;
  }

  private canStart(run: ActiveRun): boolean {
    const running = [...this.active.values()].filter((item) => item.child);
    if (running.length >= this.options.maxConcurrent) return false;
    // Runs that write data are serialized per project so they cannot interfere with each other.
    if (RISK_ORDER[run.summary.risk] > RISK_ORDER.read) {
      return !running.some((item) => item.summary.projectId === run.summary.projectId && RISK_ORDER[item.summary.risk] > RISK_ORDER.read);
    }
    return true;
  }

  private pump(): void {
    for (const runId of [...this.queue]) {
      const run = this.active.get(runId);
      if (!run) {
        this.queue.splice(this.queue.indexOf(runId), 1);
        continue;
      }
      if (!this.canStart(run)) continue;
      this.queue.splice(this.queue.indexOf(runId), 1);
      this.launch(run);
    }
  }

  private launch(run: ActiveRun): void {
    const child = fork(RUNNER, [run.jobPath], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: { ...process.env, FORCE_COLOR: '0' } });
    run.child = child;
    void this.emit(run, { type: 'run.started', pid: child.pid });
    const capture = (chunk: Buffer) => {
      if (run.log.length < LOG_LIMIT) run.log += redact(chunk.toString('utf8'));
    };
    child.stdout?.on('data', capture);
    child.stderr?.on('data', capture);
    child.on('message', (message: { type?: string; envelope?: Record<string, unknown>; code?: string; message?: string }) => {
      if (message.type === 'envelope' && message.envelope) for (const event of run.adapter.handle(message.envelope)) void this.emit(run, event);
      else if (message.type === 'fatal') run.fatal = { code: String(message.code), message: redact(String(message.message)) };
    });
    child.on('error', (error) => {
      run.fatal ??= { code: 'SPAWN_ERROR', message: redact(error.message) };
    });
    child.on('exit', (code, signal) => void this.finish(run, code, signal));
    run.timers.push(
      setTimeout(() => {
        run.timedOut = true;
        void this.emit(run, { type: 'log', level: 'warning', message: 'Tiempo máximo agotado; deteniendo la ejecución.' });
        this.stopChild(run);
      }, this.options.timeoutMs),
    );
  }

  private stopChild(run: ActiveRun): void {
    if (!run.child || run.child.exitCode !== null) return;
    if (run.child.connected) run.child.send({ type: 'cancel' });
    run.timers.push(
      setTimeout(() => {
        if (run.child && run.child.exitCode === null) {
          run.killedByManager = true;
          run.child.kill('SIGKILL');
        }
      }, this.options.cancelGraceMs),
    );
  }

  private async finish(run: ActiveRun, exitCode: number | null, signal: NodeJS.Signals | null): Promise<void> {
    for (const timer of run.timers) clearTimeout(timer);
    // Let queued envelope events land in order before the final event.
    await run.chain;
    const total = run.summary.steps.length;
    const decision = finalStatus(run.adapter, { cancelRequested: run.cancelRequested, timedOut: run.timedOut, killed: Boolean(signal) || run.killedByManager, fatal: run.fatal, exitCode }, total);
    const base = this.dir(run.summary.projectId, run.summary.runId);
    if (run.log) await this.store.writeJson([...base, 'runner-log.json'], { exitCode, signal, output: run.log });
    for (const [kind, file] of [['report', 'report.html'], ['messages', 'messages.ndjson']] as const) {
      if (await this.store.exists(...base, file)) await this.emit(run, { type: 'artifact.created', kind, file });
    }
    const started = run.summary.startedAt ? Date.parse(run.summary.startedAt) : Date.now();
    await this.emit(run, { type: 'run.finished', status: decision.status, reason: decision.reason, error: decision.error, durationMs: Date.now() - started });
    run.summary.exitCode = exitCode;
    await this.persist(run);
    this.active.delete(run.summary.runId);
    run.resolveFinished();
    this.pump();
    void this.prune(run.summary.projectId).catch(() => undefined);
  }

  /** Requests cancellation. Queued runs end immediately; running ones get a grace period, then a hard kill. */
  async cancel(projectId: string, runId: string): Promise<RunSummary> {
    const run = this.active.get(runId);
    if (!run || run.summary.projectId !== projectId) {
      const stored = await this.get(projectId, runId);
      if (isTerminal(stored.status)) return stored;
      throw new ConflictError('La ejecución no está activa en este servidor.');
    }
    if (run.cancelRequested) return run.summary;
    run.cancelRequested = true;
    await this.emit(run, { type: 'run.cancel_requested' });
    if (!run.child) {
      this.queue.splice(this.queue.indexOf(runId), 1);
      await this.emit(run, { type: 'run.finished', status: 'CANCELLED', reason: 'Cancelada antes de iniciar.' });
      await this.persist(run);
      this.active.delete(runId);
      run.resolveFinished();
      return run.summary;
    }
    this.stopChild(run);
    return run.summary;
  }

  private emit(run: ActiveRun, input: RunEventInput): Promise<unknown> {
    const event = RunEventSchema.parse({ ...input, runId: run.summary.runId, seq: run.seq++, at: new Date().toISOString() });
    Object.assign(run.summary, reduceRun(run.summary, event));
    for (const listener of this.listeners.get(run.summary.runId) ?? []) listener(event);
    run.chain = run.chain.then(() => this.store.appendJsonLine([...this.dir(run.summary.projectId, run.summary.runId), 'events.jsonl'], event));
    return run.chain;
  }

  private persist(run: ActiveRun): Promise<void> {
    return this.store.writeJson([...this.dir(run.summary.projectId, run.summary.runId), 'result.json'], run.summary);
  }

  subscribe(runId: string, listener: Listener): () => void {
    const set = this.listeners.get(runId) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(runId, set);
    return () => {
      set.delete(listener);
      if (!set.size) this.listeners.delete(runId);
    };
  }

  isActive(runId: string): boolean {
    return this.active.has(runId);
  }

  waitFor(runId: string): Promise<void> {
    return this.active.get(runId)?.finished ?? Promise.resolve();
  }

  async get(projectId: string, runId: string): Promise<RunSummary> {
    const run = this.active.get(runId);
    if (run && run.summary.projectId === projectId) return run.summary;
    const stored = await this.store.readJson<RunSummary>(...this.dir(projectId, runId), 'result.json');
    if (!stored) throw new NotFoundError(`La ejecución ${runId} no existe.`);
    return stored;
  }

  async events(projectId: string, runId: string, afterSeq = -1): Promise<{ events: RunEvent[]; corruptLines: number[] }> {
    const { entries, corruptLines } = await this.store.readJsonLines<RunEvent>(...this.dir(projectId, runId), 'events.jsonl');
    return { events: entries.filter((event) => event.seq > afterSeq), corruptLines };
  }

  async list(projectId: string): Promise<RunSummary[]> {
    await this.projects.get(projectId);
    const ids = await this.store.listDirs('projects', projectId, 'runs');
    const runs = await Promise.all(ids.map((id) => this.get(projectId, id).catch(() => null)));
    return runs.filter((run): run is RunSummary => Boolean(run)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  artifactPath(projectId: string, runId: string, file: string): string {
    if (!ARTIFACT_FILE.test(file)) throw new NotFoundError('Artefacto no permitido.');
    return this.store.resolve(...this.dir(projectId, runId), ...file.split('/'));
  }

  private async findByRequest(projectId: string, requestId: string): Promise<string | null> {
    const runs = await this.list(projectId).catch(() => []);
    return runs.find((run) => run.requestId === requestId)?.runId ?? null;
  }

  /** Marks runs left non-terminal by a previous server process as INTERRUPTED. */
  async recover(): Promise<string[]> {
    const recovered: string[] = [];
    for (const projectId of await this.store.listDirs('projects')) {
      for (const runId of await this.store.listDirs('projects', projectId, 'runs')) {
        if (this.active.has(runId)) continue;
        const stored = await this.store.readJson<RunSummary>(...this.dir(projectId, runId), 'result.json');
        if (!stored || isTerminal(stored.status)) continue;
        const { events } = await this.events(projectId, runId);
        const seq = events.reduce((max, event) => Math.max(max, event.seq), -1) + 1;
        const event = RunEventSchema.parse({ type: 'run.finished', runId, seq, at: new Date().toISOString(), status: 'INTERRUPTED', reason: 'El servidor se detuvo durante la ejecución.', error: { category: 'interrupted', message: 'La ejecución no terminó porque el servidor se reinició.' } });
        await this.store.appendJsonLine([...this.dir(projectId, runId), 'events.jsonl'], event);
        const view = foldRun(runId, [...events, event]);
        await this.store.writeJson([...this.dir(projectId, runId), 'result.json'], { ...stored, ...view });
        recovered.push(runId);
      }
    }
    return recovered;
  }

  /** Keeps the newest `retention` runs with full evidence; older PASSED/CANCELLED runs lose screenshots and traces. */
  private async prune(projectId: string): Promise<void> {
    const runs = (await this.list(projectId)).filter((run) => isTerminal(run.status));
    for (const run of runs.slice(this.options.retention)) {
      if (run.evidencePruned || !['PASSED', 'CANCELLED'].includes(run.status)) continue;
      const base = this.dir(projectId, run.runId);
      await this.store.remove(...base, 'screenshots');
      await this.store.remove(...base, 'traces');
      await this.store.writeJson([...base, 'result.json'], { ...run, evidencePruned: true, artifacts: run.artifacts.filter((artifact) => artifact.kind !== 'screenshot' && artifact.kind !== 'trace') });
    }
  }

  /** Stops every active run (server shutdown). */
  async shutdown(): Promise<void> {
    for (const run of this.active.values()) {
      if (run.child && run.child.exitCode === null) run.child.kill('SIGKILL');
    }
  }
}
