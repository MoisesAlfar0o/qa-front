import { z } from 'zod';

/**
 * Run event contract. The run manager is the only writer of `events.jsonl`; the SSE endpoint
 * replays that file and then streams new events, and the UI folds them with `reduceRun`.
 * Browser-safe: no Node imports.
 */

export const RUN_STATUSES = ['PENDING', 'RUNNING', 'PASSED', 'FAILED', 'ERROR', 'CANCELLED', 'INTERRUPTED'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
export const TERMINAL_STATUSES: readonly RunStatus[] = ['PASSED', 'FAILED', 'ERROR', 'CANCELLED', 'INTERRUPTED'];
export const isTerminal = (status: RunStatus) => TERMINAL_STATUSES.includes(status);

export const STEP_STATUSES = ['PENDING', 'RUNNING', 'PASSED', 'FAILED', 'ERROR', 'SKIPPED'] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export const ERROR_CATEGORIES = ['assertion', 'locator', 'cancelled', 'technical', 'undefined', 'ambiguous', 'pending', 'preparation', 'timeout', 'interrupted', 'security'] as const;
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

const ErrorInfo = z.object({ category: z.enum(ERROR_CATEGORIES), type: z.string().optional(), message: z.string() });
export type ErrorInfo = z.infer<typeof ErrorInfo>;

const Base = { runId: z.string(), seq: z.number().int().nonnegative(), at: z.string() };
const StepRef = z.object({ index: z.number().int().nonnegative(), keyword: z.string(), text: z.string(), line: z.number().int() });

export const RunEventSchema = z.discriminatedUnion('type', [
  z.object({ ...Base, type: z.literal('run.created'), scenarioId: z.string(), version: z.number().int(), hash: z.string(), title: z.string(), requestId: z.string().optional() }),
  z.object({ ...Base, type: z.literal('run.started'), pid: z.number().int().optional() }),
  z.object({ ...Base, type: z.literal('scenario.started'), name: z.string(), steps: z.array(StepRef) }),
  z.object({ ...Base, type: z.literal('step.started'), index: z.number().int() }),
  z.object({ ...Base, type: z.literal('step.finished'), index: z.number().int(), status: z.enum(STEP_STATUSES), durationMs: z.number(), error: ErrorInfo.optional() }),
  z.object({ ...Base, type: z.literal('hook.failed'), hook: z.enum(['before', 'after']), error: ErrorInfo }),
  z.object({ ...Base, type: z.literal('artifact.created'), kind: z.enum(['screenshot', 'trace', 'report', 'messages']), file: z.string(), stepIndex: z.number().int().optional() }),
  z.object({ ...Base, type: z.literal('log'), level: z.enum(['info', 'warning', 'error']), message: z.string() }),
  z.object({ ...Base, type: z.literal('run.cancel_requested') }),
  z.object({ ...Base, type: z.literal('run.finished'), status: z.enum(RUN_STATUSES), reason: z.string().optional(), error: ErrorInfo.optional(), durationMs: z.number().optional() }),
]);

export type RunEvent = z.infer<typeof RunEventSchema>;
type Distribute<T> = T extends unknown ? Omit<T, 'runId' | 'seq' | 'at'> : never;
export type RunEventInput = Distribute<RunEvent>;

// --- Cucumber envelope adapter -----------------------------------------------------------

export const ARTIFACT_MEDIA_TYPE = 'application/vnd.qa-front.artifact+json';

const EXCEPTION_CATEGORY: Record<string, ErrorCategory> = {
  AssertionFailedError: 'assertion',
  ElementResolutionError: 'locator',
  RunCancelledError: 'cancelled',
};

interface Exception {
  type?: string;
  message?: string;
}

interface StepResult {
  status: string;
  duration?: { seconds: number; nanos: number };
  message?: string;
  exception?: Exception;
}

/** Maps a Cucumber step result to a platform step status and error. */
export function mapStepResult(result: StepResult): { status: StepStatus; error?: ErrorInfo } {
  const message = (result.exception?.message ?? result.message ?? '').split('\n')[0].slice(0, 500);
  switch (result.status) {
    case 'PASSED':
      return { status: 'PASSED' };
    case 'SKIPPED':
      return { status: 'SKIPPED' };
    case 'FAILED': {
      const type = result.exception?.type;
      const category = (type && EXCEPTION_CATEGORY[type]) || 'technical';
      return { status: category === 'assertion' || category === 'locator' ? 'FAILED' : 'ERROR', error: { category, type, message } };
    }
    case 'UNDEFINED':
      return { status: 'ERROR', error: { category: 'undefined', message: 'Paso sin implementación en el catálogo.' } };
    case 'AMBIGUOUS':
      return { status: 'ERROR', error: { category: 'ambiguous', message: message || 'El paso coincide con varias implementaciones.' } };
    case 'PENDING':
      return { status: 'ERROR', error: { category: 'pending', message: 'Paso pendiente de implementación.' } };
    default:
      return { status: 'ERROR', error: { category: 'technical', message: message || `Estado desconocido: ${result.status}` } };
  }
}

const durationMs = (duration?: { seconds: number; nanos: number }) => (duration ? Math.round(Number(duration.seconds) * 1000 + duration.nanos / 1e6) : 0);

/** Converts the Cucumber message stream of one run into platform run events. */
export class EnvelopeAdapter {
  private readonly astSteps = new Map<string, { keyword: string; line: number }>();
  private readonly pickles = new Map<string, { name: string; steps: { id: string; text: string; astNodeIds: string[] }[] }>();
  private readonly testSteps = new Map<string, { kind: 'step'; index: number } | { kind: 'hook'; hook: 'before' | 'after' }>();
  private readonly hookKinds = new Map<string, 'before' | 'after'>();
  sawRunFinished = false;
  stepsStarted = 0;
  readonly stepStatuses = new Map<number, StepStatus>();
  readonly errors: ErrorInfo[] = [];
  hookFailure: ErrorInfo | null = null;

  handle(envelope: Record<string, any>): RunEventInput[] {
    if (envelope.gherkinDocument) {
      const visit = (children: any[]) => {
        for (const child of children ?? []) {
          for (const step of (child.background ?? child.scenario)?.steps ?? []) this.astSteps.set(step.id, { keyword: step.keyword.trim(), line: step.location.line });
          if (child.rule) visit(child.rule.children);
        }
      };
      visit(envelope.gherkinDocument.feature?.children ?? []);
      return [];
    }
    if (envelope.pickle) {
      this.pickles.set(envelope.pickle.id, envelope.pickle);
      return [];
    }
    if (envelope.hook) {
      // Cucumber 13 reports hook type; older versions do not, so AFTER hooks are inferred by position below.
      const type = String(envelope.hook.type ?? '');
      if (type) this.hookKinds.set(envelope.hook.id, type.startsWith('AFTER') ? 'after' : 'before');
      return [];
    }
    if (envelope.testCase) {
      const pickle = this.pickles.get(envelope.testCase.pickleId);
      let index = 0;
      let seenStep = false;
      for (const step of envelope.testCase.testSteps) {
        if (step.pickleStepId) {
          seenStep = true;
          this.testSteps.set(step.id, { kind: 'step', index: index++ });
        } else {
          this.testSteps.set(step.id, { kind: 'hook', hook: this.hookKinds.get(step.hookId) ?? (seenStep ? 'after' : 'before') });
        }
      }
      if (!pickle) return [];
      const steps = pickle.steps.map((step, position) => {
        const ast = this.astSteps.get(step.astNodeIds[0]);
        return { index: position, keyword: ast?.keyword ?? '*', text: step.text, line: ast?.line ?? 0 };
      });
      return [{ type: 'scenario.started', name: pickle.name, steps }];
    }
    if (envelope.testStepStarted) {
      const step = this.testSteps.get(envelope.testStepStarted.testStepId);
      if (step?.kind !== 'step') return [];
      this.stepsStarted += 1;
      this.stepStatuses.set(step.index, 'RUNNING');
      return [{ type: 'step.started', index: step.index }];
    }
    if (envelope.testStepFinished) {
      const step = this.testSteps.get(envelope.testStepFinished.testStepId);
      const result = envelope.testStepFinished.testStepResult as StepResult;
      if (!step) return [];
      const mapped = mapStepResult(result);
      if (step.kind === 'hook') {
        if (result.status === 'PASSED' || result.status === 'SKIPPED') return [];
        const error: ErrorInfo = { ...(mapped.error ?? { message: 'Fallo en hook.' }), category: mapped.error?.category === 'cancelled' ? 'cancelled' : 'preparation' } as ErrorInfo;
        this.hookFailure ??= error;
        return [{ type: 'hook.failed', hook: step.hook, error }];
      }
      this.stepStatuses.set(step.index, mapped.status);
      if (mapped.error) this.errors.push(mapped.error);
      return [{ type: 'step.finished', index: step.index, status: mapped.status, durationMs: durationMs(result.duration), error: mapped.error }];
    }
    if (envelope.attachment && envelope.attachment.mediaType === ARTIFACT_MEDIA_TYPE) {
      try {
        const artifact = JSON.parse(envelope.attachment.body) as { kind: 'screenshot' | 'trace'; file: string };
        if (!/^(screenshots|traces)\/[\w.-]+$/.test(artifact.file)) return [];
        const step = envelope.attachment.testStepId ? this.testSteps.get(envelope.attachment.testStepId) : undefined;
        return [{ type: 'artifact.created', kind: artifact.kind, file: artifact.file, stepIndex: step?.kind === 'step' ? step.index : undefined }];
      } catch {
        return [];
      }
    }
    if (envelope.testRunFinished) {
      this.sawRunFinished = true;
      return [];
    }
    return [];
  }
}

// --- Final status ------------------------------------------------------------------------

export interface FinishContext {
  cancelRequested: boolean;
  timedOut: boolean;
  killed: boolean;
  fatal?: { code: string; message: string } | null;
  exitCode: number | null;
}

/** Decides the run's final status from what was observed; never reports PASSED without every step passing. */
export function finalStatus(adapter: Pick<EnvelopeAdapter, 'sawRunFinished' | 'stepStatuses' | 'errors' | 'hookFailure'>, ctx: FinishContext, totalSteps: number): { status: RunStatus; reason: string; error?: ErrorInfo } {
  if (ctx.cancelRequested) return { status: 'CANCELLED', reason: 'Cancelada por el usuario.' };
  if (ctx.timedOut) return { status: 'ERROR', reason: 'Tiempo máximo de ejecución agotado.', error: { category: 'timeout', message: 'La ejecución superó el tiempo máximo y se detuvo.' } };
  if (ctx.fatal) return { status: 'ERROR', reason: ctx.fatal.message, error: { category: ctx.fatal.code === 'HASH_MISMATCH' ? 'security' : 'technical', message: ctx.fatal.message } };
  if (!adapter.sawRunFinished) {
    return ctx.killed
      ? { status: 'INTERRUPTED', reason: 'El proceso de ejecución terminó de forma inesperada.', error: { category: 'interrupted', message: 'El runner terminó sin finalizar la ejecución.' } }
      : { status: 'ERROR', reason: `El runner terminó (código ${ctx.exitCode}) sin completar la ejecución.`, error: { category: 'technical', message: 'Cucumber no informó el fin de la ejecución.' } };
  }
  const statuses = [...adapter.stepStatuses.values()];
  if (adapter.hookFailure) return { status: 'ERROR', reason: 'Falló la preparación o el cierre del escenario.', error: adapter.hookFailure };
  if (statuses.includes('ERROR')) return { status: 'ERROR', reason: 'Un paso falló por un error técnico.', error: adapter.errors.find((error) => error.category !== 'assertion' && error.category !== 'locator') };
  if (statuses.includes('FAILED')) return { status: 'FAILED', reason: 'Una verificación o un elemento no se cumplió.', error: adapter.errors[0] };
  if (totalSteps > 0 && statuses.length === totalSteps && statuses.every((status) => status === 'PASSED')) return { status: 'PASSED', reason: 'Todos los pasos pasaron.' };
  return { status: 'ERROR', reason: 'No todos los pasos se ejecutaron.', error: { category: 'technical', message: `Se completaron ${statuses.filter((status) => status === 'PASSED').length} de ${totalSteps} pasos.` } };
}
