import {
  ALLOWED_KEYS,
  CATALOG_VERSION,
  CLICK_KINDS,
  FIELD_KINDS,
  getAction,
  maxRisk,
  ROW_CONTROL_KINDS,
  SELECT_KINDS,
  TARGET_KIND_IDS,
  TOGGLE_KINDS,
  type RiskLevel,
  type RowCriteria,
  type Target,
  type TargetKind,
} from './catalog.ts';
import {
  allElements,
  allTables,
  bestLocator,
  findPage,
  isInventoryStale,
  pagesForNode,
  type Inventory,
  type ObservedElement,
  type ObservedTable,
  type RowControl,
} from './inventory.ts';
import { resolveNavigation, type NavigationMap } from './navigation.ts';
import { canonicalKey, storyText, type InfoSource, type ModelPlan, type ModelStep, type Plan, type PlanStep, type StoryInput } from './plan.ts';
import type { Project } from './project.ts';
import { keywords, sameName, stableStringify } from './text.ts';

export interface PromptRefs {
  elements: Map<string, ObservedElement>;
  tables: Map<string, ObservedTable>;
  rowControls: Map<string, { table: ObservedTable; control: RowControl }>;
}

export interface PlanningContext {
  project: Project;
  inventory: Inventory | null;
  navigation: NavigationMap | null;
  refs: PromptRefs;
  authStateAvailable: boolean;
}

export interface PlanMeta {
  input: StoryInput;
  provider: string;
  model: string;
  attempts: number;
  now?: Date;
}

type Resolved<T> = { ok: true; value: T } | { ok: false; question?: string; missing?: string };

const fail = <T>(question: string): Resolved<T> => ({ ok: false, question });
const ok = <T>(value: T): Resolved<T> => ({ ok: true, value });

const EXPLICIT_KIND_WORDS: Array<[RegExp, TargetKind]> = [
  [/placeholder|marcador/i, 'placeholder'],
  [/test ?id|data-testid/i, 'testId'],
  [/bot[oó]n/i, 'button'],
  [/enlace|v[ií]nculo|link/i, 'link'],
  [/pesta[ñn]a/i, 'tab'],
  [/casilla|checkbox/i, 'checkbox'],
  [/desplegable|combo|selector|dropdown/i, 'combobox'],
  [/t[ií]tulo|encabezado/i, 'heading'],
  [/etiqueta|campo|caja|filtro/i, 'label'],
];

const PENCIL_GLYPHS = /[✎✏✐🖉🖊]|pencil|edit/i;
const TRASH_GLYPHS = /🗑|trash|delete/i;

function quotedLiteral(text: string): string | null {
  const match = text.match(/["“«']([^"”»']+)["”»']/);
  return match ? match[1].trim() : null;
}

function elementNames(element: ObservedElement): string[] {
  return [element.name, element.label, element.placeholder, element.title, element.testId, element.text].filter((value): value is string => Boolean(value));
}

function sameTarget(a: Target, b: Target): boolean {
  return a.kind === b.kind && a.value === b.value;
}

class PlanBuilder {
  readonly questions: string[] = [];
  readonly warnings: string[] = [];
  readonly missing: string[] = [];
  readonly evidence: Plan['evidence'] = [];
  readonly ctx: PlanningContext;
  scope = new Set<string>();

  constructor(ctx: PlanningContext) {
    this.ctx = ctx;
  }

  ask(question: string) {
    if (!this.questions.includes(question)) this.questions.push(question);
  }

  note(warning: string) {
    if (!this.warnings.includes(warning)) this.warnings.push(warning);
  }

  recordEvidence(element: { id: string; pageId: string; evidence: { source: string; observedAt: string } }) {
    if (this.evidence.some((item) => item.elementId === element.id)) return;
    this.evidence.push({ elementId: element.id, pageId: element.pageId, source: element.evidence.source, observedAt: element.evidence.observedAt });
  }

  resolveTarget(step: ModelStep, kinds: readonly TargetKind[], purpose: 'action' | 'assertion'): Resolved<{ target: Target; source: InfoSource; elementId?: string }> {
    const ref = this.ctx.refs.elements.get(step.element.trim());
    if (ref) {
      const locator = bestLocator(ref, kinds);
      if (locator) {
        this.recordEvidence(ref);
        if (locator.count === null) this.note(`El elemento ${locator.target.kind} "${locator.target.value}" se observó por MCP y no se pudo contar su unicidad; se verificará al ejecutar.`);
        return ok({ target: locator.target, source: 'inventory', elementId: ref.id });
      }
    }

    const description = step.target.trim();
    const literal = quotedLiteral(description) ?? (ref ? ref.name : '');
    const probe = literal || description;
    if (probe) {
      const candidates = allElements(this.ctx.inventory).filter((element) => element.locators.some((locator) => kinds.includes(locator.target.kind)));
      const inScope = this.scope.size ? candidates.filter((element) => this.scope.has(element.pageId)) : candidates;
      for (const pool of [inScope, candidates]) {
        const strong = pool.filter((element) => elementNames(element).some((name) => sameName(name, probe)));
        const resolved = strong.map((element) => ({ element, locator: bestLocator(element, kinds) })).filter((item) => item.locator);
        const distinct = resolved.filter((item, index) => resolved.findIndex((other) => sameTarget(other.locator!.target, item.locator!.target)) === index);
        if (distinct.length === 1) {
          this.recordEvidence(distinct[0].element);
          return ok({ target: distinct[0].locator!.target, source: 'inventory', elementId: distinct[0].element.id });
        }
        if (distinct.length > 1) {
          return fail(`"${probe}" coincide con varios elementos: ${distinct.map((item) => `${item.locator!.target.kind} "${item.locator!.target.value}"`).join(', ')}. ¿Cuál debo usar?`);
        }
      }
    }

    if (purpose === 'assertion' && kinds.includes('text')) {
      const value = (literal || step.value || description).trim();
      if (value) {
        this.note(`El texto esperado "${value}" lo indicaste tú; no se observó en la exploración y se comprobará en la ejecución.`);
        return ok({ target: { kind: 'text', value }, source: 'user' });
      }
    }

    if (literal) {
      const explicit = EXPLICIT_KIND_WORDS.find(([pattern, kind]) => pattern.test(description) && kinds.includes(kind));
      if (explicit) {
        this.note(`El elemento ${explicit[1]} "${literal}" lo describiste tú y no está en el inventario; se resolverá durante la ejecución.`);
        return ok({ target: { kind: explicit[1], value: literal }, source: 'user' });
      }
    }

    return fail(
      `No encontré en el inventario el elemento "${description || step.element || '(sin descripción)'}" para "${step.action}". Indícalo con su texto visible exacto o explora la pantalla donde aparece.`,
    );
  }

  tablesInScope(): ObservedTable[] {
    const tables = allTables(this.ctx.inventory);
    const scoped = this.scope.size ? tables.filter((table) => this.scope.has(table.pageId)) : [];
    return scoped.length ? scoped : tables;
  }

  resolveCriteria(row: ModelStep['row'], table: ObservedTable | null): Resolved<{ criteria: RowCriteria; table: ObservedTable | null }> {
    const items = row.map((item) => ({ column: item.column.trim(), value: item.value.trim() })).filter((item) => item.column && item.value);
    if (!items.length) return fail('¿Qué registro? Indica la columna y el valor que lo identifican (por ejemplo: la fila cuyo Nombre es …).');
    const scoped = this.tablesInScope();
    const candidates = table ? [table] : scoped.filter((candidate) => items.every((item) => candidate.headers.some((header) => sameName(header, item.column))));
    if (!table && scoped.length && !candidates.length) {
      const columns = [...new Set(scoped.flatMap((candidate) => candidate.headers))].join(', ');
      return fail(`La columna "${items.map((item) => item.column).join('", "')}" no aparece en las tablas observadas (columnas: ${columns}).`);
    }
    if (candidates.length > 1) {
      return fail(`Hay varias tablas con esas columnas (${candidates.map((candidate) => candidate.name || candidate.id).join(', ')}). Indica el módulo donde está el registro.`);
    }
    const chosen = candidates[0] ?? null;
    if (!chosen) {
      this.note('No hay tablas en el inventario para comprobar las columnas; se resolverán durante la ejecución.');
      return ok({ criteria: items, table: null });
    }
    const criteria: RowCriteria = [];
    for (const item of items) {
      const header = chosen.headers.find((candidate) => sameName(candidate, item.column));
      if (!header) return fail(`La tabla "${chosen.name}" no tiene la columna "${item.column}" (columnas: ${chosen.headers.join(', ')}).`);
      criteria.push({ column: header, value: item.value });
    }
    return ok({ criteria, table: chosen });
  }

  resolveRowControl(step: ModelStep, table: ObservedTable | null): Resolved<{ target: Target; source: InfoSource; controlId?: string }> {
    const byRef = this.ctx.refs.rowControls.get(step.element.trim());
    const description = step.target.trim();
    const owner = table ?? byRef?.table ?? null;
    let control: RowControl | undefined = byRef && owner && byRef.table.id === owner.id ? byRef.control : undefined;
    if (!control && owner) {
      const probe = quotedLiteral(description) ?? description;
      const tokens = new Set(keywords(probe));
      const matches = owner.rowControls.filter((candidate) => {
        const names = [candidate.baseName, candidate.title, candidate.testId].filter((value): value is string => Boolean(value));
        if (names.some((name) => sameName(name, probe) || keywords(name).some((token) => tokens.has(token)))) return true;
        if (/l[aá]piz|pencil/i.test(probe) && candidate.iconText && PENCIL_GLYPHS.test(candidate.iconText)) return true;
        if (/papelera|basura|trash/i.test(probe) && candidate.iconText && TRASH_GLYPHS.test(candidate.iconText)) return true;
        return false;
      });
      if (matches.length > 1) return fail(`"${probe}" coincide con varios controles de la fila: ${matches.map((item) => item.observedName || item.iconText).join(', ')}. ¿Cuál?`);
      control = matches[0];
      if (!control && owner.rowControls.some((candidate) => !candidate.target)) {
        const unnamed = owner.rowControls.filter((candidate) => !candidate.target).map((candidate) => candidate.iconText || 'icono sin texto');
        return fail(
          `En la tabla "${owner.name || owner.id}" hay controles de fila sin nombre accesible, título ni data-testid (${unnamed.join(', ')}). No puedo saber con seguridad cuál es "${probe || 'el control'}". Indica cómo identificarlo o pide que se añada aria-label o data-testid.`,
        );
      }
    }
    if (control) {
      if (!control.target) {
        return fail(
          `El control "${control.iconText || 'sin texto'}" de la tabla "${owner?.name || owner?.id}" no tiene nombre accesible, título ni data-testid; no puedo identificar su función con seguridad. Indica qué control usar o pide que se añada aria-label o data-testid.`,
        );
      }
      if (!ROW_CONTROL_KINDS.includes(control.target.kind)) return fail(`El control "${control.observedName}" no se puede pulsar dentro de una fila.`);
      return ok({ target: control.target, source: 'inventory', controlId: control.id });
    }
    const literal = quotedLiteral(description);
    if (literal && !owner) {
      this.note(`El control "${literal}" de la fila lo indicaste tú; se buscará dentro de la fila al ejecutar.`);
      return ok({ target: { kind: 'button', value: literal }, source: 'user' });
    }
    return fail(`No identifiqué el control "${description || step.element}" dentro de la fila. ¿Qué botón o enlace de la fila debo pulsar?`);
  }

  resolveModulePath(expression: string | string[]): Resolved<{ nodeId: string; path: string[]; route: string | null }> {
    const resolution = resolveNavigation(this.ctx.navigation, expression);
    if (resolution.status === 'resolved') {
      resolution.warnings.forEach((warning) => this.note(warning));
      return ok({ nodeId: resolution.node.id, path: resolution.node.path, route: resolution.node.route });
    }
    const label = resolution.segments.join(' > ') || String(expression);
    if (resolution.status === 'ambiguous') {
      return fail(`"${label}" coincide con varios módulos: ${resolution.candidates.map((node) => node.path.join(' > ')).join(' | ')}. ¿Cuál?`);
    }
    if (resolution.status === 'empty') return fail('No hay mapa de navegación del proyecto. Explora la aplicación antes de planificar la navegación.');
    const hint = resolution.suggestions.length ? ` ¿Te refieres a ${resolution.suggestions.map((node) => node.path.join(' > ')).join(' o ')}?` : '';
    return fail(`No encontré el módulo "${label}" en el mapa explorado.${hint}`);
  }
}

function makeStep(action: string, params: Record<string, unknown>, source: InfoSource, elementId?: string): Resolved<PlanStep> {
  const definition = getAction(action);
  if (!definition) return { ok: false, missing: `Acción no soportada: ${action}` };
  const parsed = definition.params.safeParse(params);
  if (!parsed.success) {
    return fail(`Parámetros no válidos para "${definition.name}": ${parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ')}`);
  }
  const value = parsed.data as Record<string, unknown>;
  return ok({ action, params: value, source, elementId, description: definition.render(value), risk: definition.risk(value) as RiskLevel });
}

function resolveStep(builder: PlanBuilder, step: ModelStep, purpose: 'action' | 'assertion'): Resolved<PlanStep> {
  const value = step.value.trim();
  const target = (kinds: readonly TargetKind[]) => builder.resolveTarget(step, kinds, purpose);
  switch (step.action) {
    case 'unsupported':
      return { ok: false, missing: step.target || step.value || 'Acción solicitada sin equivalente en el catálogo.' };
    case 'open_module': {
      const module = builder.resolveModulePath(value || step.target);
      return module.ok ? makeStep('open_module', { path: module.value.path }, 'navigation') : module;
    }
    case 'click':
    case 'click_popup':
    case 'check':
    case 'uncheck':
    case 'clear':
    case 'expect_visible':
    case 'expect_hidden': {
      const kinds =
        step.action === 'check' || step.action === 'uncheck' ? TOGGLE_KINDS : step.action === 'clear' ? FIELD_KINDS : step.action.startsWith('expect') ? TARGET_KIND_IDS : CLICK_KINDS;
      const resolved = target(kinds);
      return resolved.ok ? makeStep(step.action, { target: resolved.value.target }, resolved.value.source, resolved.value.elementId) : resolved;
    }
    case 'fill':
    case 'expect_value': {
      if (step.action === 'fill' && !value) return fail(`¿Qué valor debo escribir en "${step.target || step.element}"?`);
      const resolved = target(FIELD_KINDS);
      return resolved.ok ? makeStep(step.action, { target: resolved.value.target, value }, resolved.value.source, resolved.value.elementId) : resolved;
    }
    case 'select_option': {
      if (!value) return fail(`¿Qué opción debo seleccionar en "${step.target || step.element}"?`);
      const resolved = target(SELECT_KINDS);
      return resolved.ok ? makeStep('select_option', { target: resolved.value.target, option: value }, resolved.value.source, resolved.value.elementId) : resolved;
    }
    case 'expect_contains_text': {
      if (!value) return fail('¿Qué texto debe contener el elemento?');
      const resolved = target(TARGET_KIND_IDS);
      return resolved.ok ? makeStep('expect_contains_text', { target: resolved.value.target, text: value }, resolved.value.source, resolved.value.elementId) : resolved;
    }
    case 'expect_count': {
      const count = Number.parseInt(value, 10);
      if (!Number.isInteger(count)) return fail('¿Cuántos elementos esperas ver?');
      const resolved = target(TARGET_KIND_IDS);
      return resolved.ok ? makeStep('expect_count', { target: resolved.value.target, count }, resolved.value.source, resolved.value.elementId) : resolved;
    }
    case 'press_key': {
      const key = ALLOWED_KEYS.find((candidate) => candidate.toLowerCase() === (value || step.target).trim().toLowerCase());
      return key ? makeStep('press_key', { key }, 'user') : { ok: false, missing: `Tecla no admitida: ${value || step.target}` };
    }
    case 'switch_main':
      return makeStep('switch_main', {}, 'user');
    case 'expect_url': {
      const fragment = value || quotedLiteral(step.target) || '';
      return fragment ? makeStep('expect_url', { fragment }, 'user') : fail('¿Qué fragmento de URL esperas?');
    }
    case 'row_action': {
      const preferred = builder.ctx.refs.rowControls.get(step.element.trim())?.table ?? null;
      const criteria = builder.resolveCriteria(step.row, preferred);
      if (!criteria.ok) return criteria;
      const control = builder.resolveRowControl(step, criteria.value.table);
      if (!control.ok) return control;
      return makeStep('row_action', { target: control.value.target, criteria: criteria.value.criteria }, control.value.source);
    }
    case 'expect_row':
    case 'expect_no_row': {
      const criteria = builder.resolveCriteria(step.row, null);
      return criteria.ok ? makeStep(step.action, { criteria: criteria.value.criteria }, criteria.value.table ? 'inventory' : 'user') : criteria;
    }
    case 'expect_column_all': {
      const first = step.row[0] ?? { column: step.target, value };
      const criteria = builder.resolveCriteria([{ column: first.column, value: first.value || value }], null);
      return criteria.ok
        ? makeStep('expect_column_all', { column: criteria.value.criteria[0].column, value: criteria.value.criteria[0].value }, criteria.value.table ? 'inventory' : 'user')
        : criteria;
    }
    case 'expect_row_count': {
      const count = Number.parseInt(value, 10);
      return Number.isInteger(count) ? makeStep('expect_row_count', { count }, 'user') : fail('¿Cuántas filas esperas?');
    }
    default:
      return { ok: false, missing: `Acción no soportada: ${step.action}` };
  }
}

function detectContradictions(builder: PlanBuilder, actions: PlanStep[], assertions: PlanStep[]) {
  const rows = assertions.filter((step) => step.action === 'expect_row').map((step) => stableStringify(step.params.criteria));
  for (const step of assertions.filter((item) => item.action === 'expect_no_row')) {
    if (rows.includes(stableStringify(step.params.criteria))) builder.ask('Las verificaciones se contradicen: esperas que la misma fila exista y no exista. ¿Cuál es el resultado correcto?');
  }
  const visible = assertions.filter((step) => step.action === 'expect_visible').map((step) => stableStringify(step.params.target));
  for (const step of assertions.filter((item) => item.action === 'expect_hidden')) {
    if (visible.includes(stableStringify(step.params.target))) builder.ask('Las verificaciones se contradicen: el mismo elemento debe verse y no verse.');
  }
  const lastFill = new Map<string, string>();
  for (const step of actions) {
    if (step.action === 'fill') {
      const key = stableStringify(step.params.target);
      if (lastFill.has(key) && lastFill.get(key) !== step.params.value) builder.note(`El campo de "${step.description}" se rellena dos veces con valores distintos.`);
      lastFill.set(key, String(step.params.value));
    } else if (step.action === 'click' || step.action === 'row_action') {
      lastFill.clear();
    }
  }
}

export function resolveModelPlan(model: ModelPlan, ctx: PlanningContext, meta: PlanMeta): Plan {
  const builder = new PlanBuilder(ctx);
  const now = meta.now ?? new Date();
  let destination: Plan['destination'] = null;

  if (!ctx.inventory) builder.note('El proyecto no tiene inventario; explora la aplicación para que los elementos se resuelvan con evidencia.');
  else if (isInventoryStale(ctx.inventory, now.getTime())) builder.note(`El inventario es del ${ctx.inventory.exploredAt}; puede estar obsoleto. Vuelve a explorar si la aplicación cambió.`);

  const destinationText = model.destination.map((segment) => segment.trim()).filter(Boolean);
  if (destinationText.length) {
    const module = builder.resolveModulePath(destinationText);
    if (module.ok) {
      destination = { ...module.value, source: 'navigation' };
      builder.scope = pagesForNode(ctx.inventory, module.value.nodeId);
    } else if (module.question) builder.ask(module.question);
  }

  const collect = (steps: ModelStep[], purpose: 'action' | 'assertion') => {
    const resolved: PlanStep[] = [];
    for (const step of steps) {
      const result = resolveStep(builder, step, purpose);
      if (result.ok) resolved.push(result.value);
      else if (result.missing) builder.missing.push(result.missing);
      else if (result.question) builder.ask(result.question);
    }
    return resolved;
  };

  const actions = collect(model.actions, 'action');
  const assertions = collect(model.assertions, 'assertion');

  if (!destination) {
    const firstElement = [...actions, ...assertions].find((step) => step.elementId);
    const element = firstElement && allElements(ctx.inventory).find((item) => item.id === firstElement.elementId);
    const page = element ? findPage(ctx.inventory, element.pageId) : undefined;
    const owner = page?.kind === 'state' && page.parentPageId ? findPage(ctx.inventory, page.parentPageId) : page;
    const node = owner?.navNodeId ? ctx.navigation?.nodes.find((item) => item.id === owner.navNodeId) : undefined;
    if (node) {
      destination = { nodeId: node.id, path: node.path, route: node.route, source: 'inferred' };
      builder.note(`No indicaste el módulo; se infiere ${node.path.join(' > ')} porque ahí se observó el elemento usado.`);
    }
  }

  if (destination && !(actions[0]?.action === 'open_module' && stableStringify(actions[0].params.path) === stableStringify(destination.path))) {
    const open = makeStep('open_module', { path: destination.path }, destination.source);
    if (open.ok) actions.unshift(open.value);
  }

  if (!assertions.length) builder.ask('No indicaste qué resultado esperas. ¿Qué debo comprobar al final de la prueba?');
  if (!actions.length) builder.ask('No identifiqué ninguna acción ejecutable. ¿Qué pasos debe realizar la prueba?');
  detectContradictions(builder, actions, assertions);

  const allSteps = [...actions, ...assertions];
  const level = maxRisk(allSteps.map((step) => step.risk));
  const reasons = allSteps.filter((step) => step.risk !== 'read').map((step) => `${step.risk === 'destructive' ? 'Acción destructiva' : 'Modifica datos'}: ${step.description}`);
  const authorizationRequired = level === 'destructive' || (level === 'write' && ctx.project.environment !== 'test');
  if (level === 'write') builder.note('La prueba modifica datos persistentes. Usa datos de prueba: no hay una estrategia de restauración registrada para esta aplicación.');
  if (level !== 'read' && ctx.project.environment === 'production') builder.note('El proyecto está marcado como producción: no se ejecutará sin autorización explícita.');

  const preconditions: Plan['preconditions'] = [
    { id: 'start_page', description: `Abrir ${ctx.project.startPath} en ${ctx.project.baseUrl}`, satisfied: true, mechanism: 'navigate_url' },
  ];
  if (ctx.project.auth.mode === 'storage-state') {
    preconditions.push({ id: 'session', description: 'Sesión guardada del proyecto', satisfied: ctx.authStateAvailable, mechanism: 'session_ready' });
    if (!ctx.authStateAvailable) builder.ask('El proyecto requiere sesión, pero no hay estado de sesión guardado (auth/storage-state.json).');
  }

  let status: Plan['status'] = 'ready';
  if (builder.missing.length) status = 'unsupported';
  else if (builder.questions.length) status = 'needs_clarification';
  else if (model.status !== 'ready') {
    status = model.status;
    const modelQuestions = model.questions.map((question) => question.trim()).filter(Boolean);
    if (model.status === 'unsupported') builder.missing.push(...(model.missing.length ? model.missing : ['El modelo indicó que la solicitud no es compatible con el catálogo.']));
    else if (modelQuestions.length) modelQuestions.forEach((question) => builder.ask(question));
    else builder.ask('El planner no pudo confirmar la interpretación. Reformula la instrucción con más detalle.');
  }

  const plan: Omit<Plan, 'canonicalKey'> = {
    schemaVersion: 1,
    status,
    title: model.title.trim() || 'Escenario sin título',
    objective: model.objective.trim(),
    originalText: storyText(meta.input),
    input: meta.input,
    preconditions,
    destination,
    actions,
    assertions,
    questions: builder.questions,
    warnings: builder.warnings,
    missingCapabilities: builder.missing,
    evidence: builder.evidence,
    risk: { level, reasons, authorizationRequired },
    provenance: {
      provider: meta.provider,
      model: meta.model,
      attempts: meta.attempts,
      generatedAt: now.toISOString(),
      catalogVersion: CATALOG_VERSION,
      inventoryExploredAt: ctx.inventory?.exploredAt ?? null,
    },
  };
  return { ...plan, canonicalKey: canonicalKey(plan) };
}

/** Compact, numbered view of the observed application for the model prompt. */
export function buildPromptContext(ctx: Omit<PlanningContext, 'refs'>, story: string, limits = { elements: 40, nav: 40 }): { text: string; refs: PromptRefs } {
  const refs: PromptRefs = { elements: new Map(), tables: new Map(), rowControls: new Map() };
  const lines: string[] = [];
  const nav = ctx.navigation?.nodes ?? [];
  lines.push('NAVIGATION (observed menu hierarchy):');
  if (!nav.length) lines.push('- (none explored)');
  for (const node of nav.slice(0, limits.nav)) lines.push(`- ${node.path.join(' > ')}${node.route ? ` (route ${node.route})` : ''}${node.status === 'stale' ? ' [stale]' : ''}`);

  const pageLabel = (pageId: string) => {
    const page = findPage(ctx.inventory, pageId);
    if (!page) return pageId;
    const ownerNodeId = page.navNodeId ?? findPage(ctx.inventory, page.parentPageId ?? '')?.navNodeId;
    const node = ctx.navigation?.nodes.find((item) => item.id === ownerNodeId);
    const base = node ? node.path.join(' > ') : page.title || page.path;
    return page.kind === 'state' ? `${base} / ${page.trigger ?? page.title}` : base;
  };

  const storyTokens = new Set(keywords(story));
  const scored = allElements(ctx.inventory)
    .filter((element) => !element.inNavigation && element.locators.length)
    .map((element) => ({ element, score: elementNames(element).reduce((sum, name) => sum + keywords(name).filter((token) => storyTokens.has(token)).length, 0) }))
    .sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  lines.push('', 'ELEMENTS (use the id in "element"):');
  let index = 0;
  for (const { element } of scored) {
    if (index >= limits.elements) break;
    const locator = bestLocator(element);
    if (!locator) continue;
    const key = `${element.pageId}|${locator.target.kind}|${locator.target.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    index += 1;
    const id = `E${index}`;
    refs.elements.set(id, element);
    const extra = [element.placeholder && `placeholder "${element.placeholder}"`, element.label && `label "${element.label}"`].filter(Boolean).join(', ');
    lines.push(`${id} | ${element.role} "${element.name || locator.target.value}"${extra ? ` (${extra})` : ''} | on ${pageLabel(element.pageId)}`);
  }
  if (!index) lines.push('- (none explored)');

  lines.push('', 'TABLES (records are identified with row = [{column, value}]):');
  let tableIndex = 0;
  for (const table of allTables(ctx.inventory)) {
    tableIndex += 1;
    const tableId = `T${tableIndex}`;
    refs.tables.set(tableId, table);
    lines.push(`${tableId} | table "${table.name}" columns [${table.headers.join(', ')}] | on ${pageLabel(table.pageId)}`);
    table.rowControls.forEach((control, controlIndex) => {
      const controlId = `${tableId}C${controlIndex + 1}`;
      refs.rowControls.set(controlId, { table, control });
      const label = control.target ? `${control.role} "${control.baseName || control.target.value}"` : 'control WITHOUT accessible name';
      lines.push(`  ${controlId} | row control: ${label}${control.iconText ? ` icon "${control.iconText}"` : ''}${control.title ? ` title "${control.title}"` : ''}`);
    });
  }
  if (!tableIndex) lines.push('- (none explored)');
  return { text: lines.join('\n'), refs };
}
