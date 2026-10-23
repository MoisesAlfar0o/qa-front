import { AstBuilder, compile, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import { CucumberExpression, ParameterType, ParameterTypeRegistry } from '@cucumber/cucumber-expressions';
import { IdGenerator, type GherkinDocument } from '@cucumber/messages';

import {
  ACTIONS,
  CATALOG_VERSION,
  GENERATOR_VERSION,
  maxRisk,
  PARAMETER_TYPES,
  type ActionDefinition,
  type RiskLevel,
  type Target,
} from './catalog.ts';
import { canonicalFeature, sha256 } from './hash.ts';
import { allElements, type Inventory } from './inventory.ts';
import { resolveNavigation, type NavigationMap } from './navigation.ts';
import type { Plan } from './plan.ts';
import type { Project } from './project.ts';
import { keywords } from './text.ts';

// --- Generation ------------------------------------------------------------------------

function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Deterministic: the same plan, project start page, catalog and generator version always
 * produce the same bytes. Unresolved parts of a non-ready plan are kept as comments so a
 * partial draft can be reviewed but never approved as-is.
 */
export function generateFeature(plan: Plan, project: Pick<Project, 'startPath' | 'auth'>): string {
  const title = oneLine(plan.title) || 'Escenario';
  const lines = [
    '# language: es',
    `# Generado por qa-front · catálogo ${CATALOG_VERSION} · generador ${GENERATOR_VERSION} · plan ${plan.canonicalKey.slice(0, 12)}`,
    `@qa-front @riesgo-${plan.risk.level}`,
    `Característica: ${title}`,
  ];
  if (plan.objective) lines.push(`  Objetivo: ${oneLine(plan.objective)}`);
  lines.push('', `  Escenario: ${title}`);

  const steps: string[] = [];
  const add = (keyword: string, text: string) => steps.push(`    ${keyword} ${text}`);
  add('Dado', `que abro la ruta "${project.startPath}"`);
  if (project.auth.mode === 'storage-state') add('Y', 'que la sesión está iniciada');
  plan.actions.forEach((step, index) => add(index === 0 ? 'Cuando' : 'Y', step.description));
  plan.assertions.forEach((step, index) => add(index === 0 ? 'Entonces' : 'Y', step.description));
  lines.push(...steps);

  const pending = [...plan.questions.map((item) => `ACLARACIÓN: ${item}`), ...plan.missingCapabilities.map((item) => `NO SOPORTADO: ${item}`)];
  if (pending.length) lines.push('', ...pending.map((item) => `    # PENDIENTE ${oneLine(item)}`));
  return canonicalFeature(lines.join('\n'));
}

// --- Step matching (same expressions and parameter types as runner/support/steps.ts) ---

const registry = new ParameterTypeRegistry();
for (const parameter of PARAMETER_TYPES) {
  registry.defineParameterType(
    new ParameterType(parameter.name, parameter.regexp, null, (...groups: string[]) => (parameter.transform as (...args: string[]) => unknown)(...groups), false, false),
  );
}
const MATCHERS = ACTIONS.map((action) => ({ action: action as ActionDefinition, expression: new CucumberExpression(action.expression, registry) }));

export interface StepMatch {
  action: ActionDefinition;
  params: Record<string, unknown>;
}

export type MatchResult = { status: 'matched'; match: StepMatch } | { status: 'undefined' } | { status: 'ambiguous'; actions: string[] } | { status: 'invalid'; action: string; message: string };

export function matchStep(text: string): MatchResult {
  const hits = MATCHERS.map(({ action, expression }) => ({ action, args: expression.match(text) })).filter((hit) => hit.args);
  if (!hits.length) return { status: 'undefined' };
  if (hits.length > 1) return { status: 'ambiguous', actions: hits.map((hit) => hit.action.id) };
  const { action, args } = hits[0];
  const parsed = action.params.safeParse(action.fromArgs(args!.map((arg) => arg.getValue(null))));
  if (!parsed.success) return { status: 'invalid', action: action.id, message: parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ') };
  return { status: 'matched', match: { action, params: parsed.data as Record<string, unknown> } };
}

export function suggestStep(text: string): string | undefined {
  const tokens = new Set(keywords(text.replace(/"[^"]*"/g, ' ')));
  let best: { score: number; expression: string } | undefined;
  for (const action of ACTIONS) {
    const words = keywords(action.expression.replace(/\{[^}]+\}/g, ' '));
    const score = words.filter((word) => tokens.has(word)).length / Math.max(words.length, 1);
    if (score > 0 && (!best || score > best.score)) best = { score, expression: action.expression };
  }
  return best?.expression;
}

// --- Validation ------------------------------------------------------------------------

export interface Issue {
  line?: number;
  code: string;
  message: string;
  suggestion?: string;
}

export interface ValidatedStep {
  line: number;
  keyword: string;
  text: string;
  scenario: string;
  actionId: string | null;
  params?: Record<string, unknown>;
  risk: RiskLevel;
  category?: string;
}

export interface FeatureValidation {
  valid: boolean;
  hash: string;
  featureName: string;
  scenarios: string[];
  errors: Issue[];
  warnings: Issue[];
  steps: ValidatedStep[];
  risk: { level: RiskLevel; reasons: string[] };
  catalogVersion: string;
}

export interface ValidationContext {
  project?: Pick<Project, 'auth'> | null;
  authStateAvailable?: boolean;
  navigation?: NavigationMap | null;
  inventory?: Inventory | null;
  plan?: Plan | null;
}

function parseDocument(text: string): { document: GherkinDocument | null; errors: Issue[] } {
  const parser = new Parser(new AstBuilder(IdGenerator.uuid()), new GherkinClassicTokenMatcher('es'));
  try {
    return { document: parser.parse(text), errors: [] };
  } catch (error) {
    const list = (error as { errors?: Array<{ message: string; location?: { line: number } }> }).errors ?? [error as { message: string; location?: { line: number } }];
    return { document: null, errors: list.map((item) => ({ line: item.location?.line, code: 'syntax', message: item.message.replace(/^\(\d+:\d+\):\s*/, '') })) };
  }
}

function stepIndex(document: GherkinDocument): Map<string, { line: number; keyword: string; keywordType?: string }> {
  const index = new Map<string, { line: number; keyword: string; keywordType?: string }>();
  const visit = (children: readonly any[]) => {
    for (const child of children) {
      const container = child.background ?? child.scenario;
      for (const step of container?.steps ?? []) index.set(step.id, { line: step.location.line, keyword: step.keyword.trim(), keywordType: step.keywordType });
      if (child.rule) visit(child.rule.children);
    }
  };
  visit(document.feature?.children ?? []);
  return index;
}

function inventoryCountsFor(inventory: Inventory | null | undefined, target: Target): number[] {
  return allElements(inventory ?? null).flatMap((element) =>
    element.locators.filter((locator) => locator.target.kind === target.kind && locator.target.value === target.value).map((locator) => locator.count ?? -1),
  );
}

export function validateFeature(rawText: string, ctx: ValidationContext = {}): FeatureValidation {
  const text = canonicalFeature(rawText);
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const steps: ValidatedStep[] = [];
  const result = (): FeatureValidation => {
    const level = maxRisk(steps.map((step) => step.risk));
    return {
      valid: errors.length === 0,
      hash: sha256(text),
      featureName: document?.feature?.name ?? '',
      scenarios,
      errors,
      warnings,
      steps,
      risk: { level, reasons: steps.filter((step) => step.risk !== 'read').map((step) => `${step.risk}: ${step.text}`) },
      catalogVersion: CATALOG_VERSION,
    };
  };

  if (!/^#\s*language:\s*es\s*$/m.test(text.split('\n').slice(0, 3).join('\n'))) {
    warnings.push({ line: 1, code: 'language', message: 'Falta "# language: es" al inicio; se usará español por defecto.' });
  }
  const { document, errors: syntaxErrors } = parseDocument(text);
  const scenarios: string[] = [];
  errors.push(...syntaxErrors);
  if (!document) return result();
  if (!document.feature) {
    errors.push({ code: 'no_feature', message: 'El archivo no contiene una "Característica".' });
    return result();
  }

  const pickles = compile(document, 'scenario.feature', IdGenerator.uuid());
  if (!pickles.length) errors.push({ code: 'no_scenarios', message: 'La característica no tiene escenarios con pasos.' });
  const index = stepIndex(document);

  for (const pickle of pickles) {
    scenarios.push(pickle.name);
    let assertions = 0;
    for (const pickleStep of pickle.steps) {
      const location = index.get(pickleStep.astNodeIds[0]) ?? { line: 0, keyword: '' };
      const base = { line: location.line, keyword: location.keyword, text: pickleStep.text, scenario: pickle.name };
      const matched = matchStep(pickleStep.text);
      if (matched.status !== 'matched') {
        steps.push({ ...base, actionId: null, risk: 'read' });
        if (matched.status === 'undefined') {
          errors.push({ line: location.line, code: 'undefined_step', message: `Paso sin implementación: "${pickleStep.text}".`, suggestion: suggestStep(pickleStep.text) });
        } else if (matched.status === 'ambiguous') {
          errors.push({ line: location.line, code: 'ambiguous_step', message: `El paso coincide con varias definiciones (${matched.actions.join(', ')}).` });
        } else {
          errors.push({ line: location.line, code: 'invalid_params', message: `Parámetros no válidos en "${pickleStep.text}": ${matched.message}` });
        }
        continue;
      }
      const { action, params } = matched.match;
      const risk = action.risk(params) as RiskLevel;
      steps.push({ ...base, actionId: action.id, params, risk, category: action.category });
      if (action.category === 'assertion') assertions += 1;

      const keywordType = pickleStep.type;
      if (action.category === 'assertion' && keywordType === 'Action') {
        warnings.push({ line: location.line, code: 'keyword', message: 'Es una verificación: conviene usar "Entonces".' });
      }
      if (action.category !== 'assertion' && keywordType === 'Outcome') {
        warnings.push({ line: location.line, code: 'keyword', message: 'Es una acción: conviene usar "Cuando".' });
      }

      if (action.id === 'session_ready' && (ctx.project?.auth.mode !== 'storage-state' || !ctx.authStateAvailable)) {
        errors.push({ line: location.line, code: 'precondition', message: 'El paso de sesión requiere un proyecto con estado de sesión guardado (auth/storage-state.json).' });
      }
      if (action.id === 'open_module' && ctx.navigation) {
        const resolution = resolveNavigation(ctx.navigation, params.path as string[]);
        if (resolution.status === 'ambiguous') {
          errors.push({
            line: location.line,
            code: 'ambiguous_destination',
            message: `"${(params.path as string[]).join(' > ')}" coincide con varios módulos: ${resolution.candidates.map((node) => node.path.join(' > ')).join(' | ')}.`,
          });
        } else if (resolution.status !== 'resolved') {
          warnings.push({ line: location.line, code: 'unverified_destination', message: `El módulo "${(params.path as string[]).join(' > ')}" no está en el mapa explorado.` });
        }
      }
      const target = params.target as Target | undefined;
      if (target && target.kind !== 'text' && ctx.inventory && action.id !== 'row_action') {
        const counts = inventoryCountsFor(ctx.inventory, target);
        if (!counts.length) warnings.push({ line: location.line, code: 'unverified_target', message: `${target.kind} "${target.value}" no está en el inventario; se resolverá al ejecutar.` });
        else if (counts.every((count) => count > 1)) {
          errors.push({ line: location.line, code: 'ambiguous_target', message: `${target.kind} "${target.value}" coincidía con varios elementos en la exploración; usa un localizador más específico.` });
        }
      }
    }
    if (!assertions) errors.push({ code: 'no_assertions', message: `El escenario "${pickle.name}" no tiene ninguna verificación (Entonces).` });
  }

  if (ctx.plan) {
    const expected = [...ctx.plan.actions, ...ctx.plan.assertions].map((step) => step.description);
    const actual = steps.filter((step) => step.category && step.category !== 'precondition').map((step) => step.text);
    if (expected.join('\n') !== actual.join('\n')) {
      warnings.push({ code: 'plan_divergence', message: 'El contenido difiere del plan generado (edición manual). Se valida y aprueba el .feature tal como está.' });
    }
  }
  return result();
}
