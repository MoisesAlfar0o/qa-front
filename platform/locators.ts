import type { Locator, Page } from '@playwright/test';

import { TARGET_KINDS, type Target } from './catalog.ts';

type Scope = Page | Locator;

/**
 * Single locator strategy shared by the explorer (to count candidates) and the runner (to act),
 * so a target the inventory marked as unique is located the same way at execution time.
 * Names match exactly, except inside a table row (row controls often embed the record name,
 * "Editar Ana") and for text, which matches as a case-insensitive substring.
 */
export function locatorFor(scope: Scope, target: Target, options: { inRow?: boolean } = {}): Locator {
  const exact = !options.inRow;
  switch (target.kind) {
    case 'label':
      return scope.getByLabel(target.value, { exact: true });
    case 'placeholder':
      return scope.getByPlaceholder(target.value, { exact: true });
    case 'testId':
      return scope.getByTestId(target.value);
    case 'title':
      return scope.getByTitle(target.value, { exact });
    case 'text':
      return scope.getByText(target.value);
    default: {
      const role = TARGET_KINDS[target.kind].role;
      if (!role) throw new Error(`Unsupported target kind: ${target.kind}`);
      return scope.getByRole(role, { name: target.value, exact });
    }
  }
}

export function visible(locator: Locator): Locator {
  return locator.filter({ visible: true });
}
