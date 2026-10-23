/** Process-wide cancellation state for the runner child process. */

interface Closable {
  close(): Promise<void>;
}

const state = { requested: false, active: null as Closable | null };

export function isCancelRequested(): boolean {
  return state.requested;
}

export function setActiveContext(context: Closable | null): void {
  state.active = context;
}

/** Marks the run as cancelled and closes the browser context so in-flight actions stop now. */
export async function requestCancel(): Promise<void> {
  if (state.requested) return;
  state.requested = true;
  await state.active?.close().catch(() => undefined);
}
