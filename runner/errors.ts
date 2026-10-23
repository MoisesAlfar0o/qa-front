/**
 * Error classes thrown by step implementations. Cucumber reports `exception.type`, which the
 * server maps to a step status: assertion → FAILED, element resolution → FAILED (locator),
 * cancellation → CANCELLED, anything else → ERROR (technical).
 */

export class AssertionFailedError extends Error {
  override name = 'AssertionFailedError';
}

export class ElementResolutionError extends Error {
  override name = 'ElementResolutionError';
}

export class RunCancelledError extends Error {
  override name = 'RunCancelledError';
}

export class TechnicalError extends Error {
  override name = 'TechnicalError';
}

export const ERROR_CATEGORY: Record<string, 'assertion' | 'locator' | 'cancelled' | 'technical'> = {
  AssertionFailedError: 'assertion',
  ElementResolutionError: 'locator',
  RunCancelledError: 'cancelled',
};
