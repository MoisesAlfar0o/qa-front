import { defineParameterType, When } from '@cucumber/cucumber';

import { ACTIONS, PARAMETER_TYPES, type ActionDefinition } from '../../platform/catalog.ts';
import { executeAction } from '../actions.ts';
import { isCancelRequested } from '../cancel.ts';
import { RunCancelledError, TechnicalError } from '../errors.ts';
import type { QaWorld } from './world.ts';

for (const type of PARAMETER_TYPES) {
  defineParameterType({ name: type.name, regexp: type.regexp, transformer: type.transform as (...groups: string[]) => unknown, useForSnippets: false });
}

async function run(world: QaWorld, action: ActionDefinition, args: unknown[]): Promise<void> {
  if (isCancelRequested()) throw new RunCancelledError('Ejecución cancelada por el usuario.');
  const parsed = action.params.safeParse(action.fromArgs(args));
  if (!parsed.success) throw new TechnicalError(`Parámetros inválidos para "${action.name}": ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
  try {
    await executeAction(world, action.id, parsed.data as Record<string, unknown>);
  } catch (error) {
    // Closing the context on cancel makes Playwright throw "Target closed"; report it as a cancellation.
    if (isCancelRequested()) throw new RunCancelledError('Ejecución cancelada por el usuario.');
    throw error;
  }
}

// Cucumber validates the step function arity against the expression, so each arity gets a fixed signature.
function handler(action: ActionDefinition, arity: number) {
  switch (arity) {
    case 0:
      return function (this: QaWorld) {
        return run(this, action, []);
      };
    case 1:
      return function (this: QaWorld, a: unknown) {
        return run(this, action, [a]);
      };
    case 2:
      return function (this: QaWorld, a: unknown, b: unknown) {
        return run(this, action, [a, b]);
      };
    case 3:
      return function (this: QaWorld, a: unknown, b: unknown, c: unknown) {
        return run(this, action, [a, b, c]);
      };
    default:
      throw new Error(`Unsupported arity ${arity} for ${action.id}`);
  }
}

for (const action of ACTIONS as readonly ActionDefinition[]) {
  const arity = (action.expression.match(/\{[^}]+\}/g) ?? []).length;
  When(action.expression, handler(action, arity));
}
