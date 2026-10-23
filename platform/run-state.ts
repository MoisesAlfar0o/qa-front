import { isTerminal, type ErrorInfo, type RunEvent, type RunStatus, type StepStatus } from './run-events.ts';

/** Pure fold of run events into the view shown by the UI and stored as the run summary. Browser-safe. */

export interface StepView {
  index: number;
  keyword: string;
  text: string;
  line: number;
  status: StepStatus;
  durationMs?: number;
  error?: ErrorInfo;
  screenshot?: string;
}

export interface RunView {
  runId: string;
  scenarioId: string;
  version: number;
  hash: string;
  title: string;
  status: RunStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  scenarioName?: string;
  steps: StepView[];
  currentStep: number | null;
  artifacts: { kind: string; file: string; stepIndex?: number }[];
  cancelRequested: boolean;
  reason?: string;
  error?: ErrorInfo;
  hookError?: ErrorInfo;
  lastSeq: number;
}

export function emptyRun(runId: string): RunView {
  return { runId, scenarioId: '', version: 0, hash: '', title: '', status: 'PENDING', createdAt: '', steps: [], currentStep: null, artifacts: [], cancelRequested: false, lastSeq: -1 };
}

export function reduceRun(state: RunView, event: RunEvent): RunView {
  // Duplicate or replayed events (SSE reconnect) are ignored by sequence number.
  if (event.seq <= state.lastSeq) return state;
  const next: RunView = { ...state, lastSeq: event.seq };
  const terminal = isTerminal(state.status);
  // After a terminal state only artifacts and logs may still arrive; late step events are ignored.
  if (terminal && event.type !== 'artifact.created' && event.type !== 'log') return next;
  switch (event.type) {
    case 'run.created':
      return { ...next, scenarioId: event.scenarioId, version: event.version, hash: event.hash, title: event.title, createdAt: event.at, status: 'PENDING' };
    case 'run.started':
      return { ...next, status: 'RUNNING', startedAt: event.at };
    case 'scenario.started':
      return { ...next, scenarioName: event.name, steps: event.steps.map((step) => ({ ...step, status: 'PENDING' })) };
    case 'step.started':
      return { ...next, currentStep: event.index, steps: next.steps.map((step) => (step.index === event.index ? { ...step, status: 'RUNNING' } : step)) };
    case 'step.finished':
      return {
        ...next,
        currentStep: next.currentStep === event.index ? null : next.currentStep,
        steps: next.steps.map((step) => (step.index === event.index ? { ...step, status: event.status, durationMs: event.durationMs, error: event.error } : step)),
      };
    case 'hook.failed':
      return { ...next, hookError: event.error };
    case 'artifact.created': {
      const artifacts = [...next.artifacts, { kind: event.kind, file: event.file, stepIndex: event.stepIndex }];
      const steps = event.kind === 'screenshot' && event.stepIndex !== undefined ? next.steps.map((step) => (step.index === event.stepIndex ? { ...step, screenshot: event.file } : step)) : next.steps;
      return { ...next, artifacts, steps };
    }
    case 'run.cancel_requested':
      return { ...next, cancelRequested: true };
    case 'run.finished':
      return {
        ...next,
        status: event.status,
        reason: event.reason,
        error: event.error,
        finishedAt: event.at,
        durationMs: event.durationMs,
        currentStep: null,
        // Steps still pending or running when the run ends were never completed.
        steps: next.steps.map((step) => (step.status === 'PENDING' || step.status === 'RUNNING' ? { ...step, status: 'SKIPPED' } : step)),
      };
    case 'log':
      return next;
    default:
      return next;
  }
}

export function foldRun(runId: string, events: RunEvent[]): RunView {
  return events.reduce(reduceRun, emptyRun(runId));
}
