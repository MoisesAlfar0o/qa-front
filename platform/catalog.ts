import { z } from 'zod';

/**
 * Canonical action catalog. Every executable capability is declared once here:
 * contract (zod params), Gherkin template (Cucumber expression + render), risk and
 * locator rules. The planner, the Gherkin generator, the validator and the Cucumber
 * step definitions (runner/support/steps.ts) all read this list, so a step can only
 * be generated if it has an implementation and vice versa.
 *
 * Bump CATALOG_VERSION when an expression or its meaning changes; approved versions
 * record the catalog version they were validated against and are re-validated at run time.
 */
export const CATALOG_VERSION = '1.0.0';
export const GENERATOR_VERSION = '1.0.0';

export const TARGET_KINDS = {
  button: { phrase: 'el botón', role: 'button' },
  link: { phrase: 'el enlace', role: 'link' },
  tab: { phrase: 'la pestaña', role: 'tab' },
  checkbox: { phrase: 'la casilla', role: 'checkbox' },
  radio: { phrase: 'la opción de radio', role: 'radio' },
  switch: { phrase: 'el interruptor', role: 'switch' },
  menuitem: { phrase: 'el elemento de menú', role: 'menuitem' },
  heading: { phrase: 'el título', role: 'heading' },
  dialog: { phrase: 'el diálogo', role: 'dialog' },
  combobox: { phrase: 'el desplegable', role: 'combobox' },
  textbox: { phrase: 'el cuadro de texto', role: 'textbox' },
  placeholder: { phrase: 'el campo con placeholder', role: null },
  label: { phrase: 'el campo', role: null },
  testId: { phrase: 'el elemento con test id', role: null },
  title: { phrase: 'el elemento con título', role: null },
  text: { phrase: 'el texto', role: null },
} as const;

export type TargetKind = keyof typeof TARGET_KINDS;
export const TARGET_KIND_IDS = Object.keys(TARGET_KINDS) as TargetKind[];
export type AriaRole = NonNullable<(typeof TARGET_KINDS)[TargetKind]['role']>;

export const FIELD_KINDS: TargetKind[] = ['label', 'placeholder', 'textbox', 'combobox', 'testId', 'title'];
export const SELECT_KINDS: TargetKind[] = ['combobox', 'label', 'testId'];
export const TOGGLE_KINDS: TargetKind[] = ['checkbox', 'radio', 'switch', 'label', 'testId'];
export const CLICK_KINDS: TargetKind[] = ['button', 'link', 'tab', 'checkbox', 'radio', 'switch', 'menuitem', 'text', 'testId', 'title'];
export const ROW_CONTROL_KINDS: TargetKind[] = ['button', 'link', 'menuitem', 'testId', 'title'];

export const ALLOWED_KEYS = ['Enter', 'Tab', 'Escape', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Space', 'Backspace', 'Home', 'End'] as const;

export const DESTRUCTIVE_PATTERN = /\b(eliminar|elimina|borrar|borra|suprimir|delete|remove|anular|desactivar|deshabilitar|aprobar|rechazar|pagar|desembolsar|transferir|notificar|revocar|cerrar sesi[oó]n|logout)\b/i;
export const WRITE_PATTERN = /\b(guardar|guarda|save|actualizar|update|enviar|submit|crear|create|confirmar|aceptar|registrar|agregar|añadir|publicar)\b/i;

const LiteralSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => !/["\r\n]/.test(value), 'No puede contener comillas dobles ni saltos de línea.');

const ValueSchema = z
  .string()
  .max(300)
  .refine((value) => !/["\r\n]/.test(value), 'No puede contener comillas dobles ni saltos de línea.');

export function targetSchema(kinds: readonly TargetKind[] = TARGET_KIND_IDS) {
  return z.object({ kind: z.enum(kinds as [TargetKind, ...TargetKind[]]), value: LiteralSchema });
}

export type Target = { kind: TargetKind; value: string };

export const CriteriaSchema = z
  .array(z.object({ column: LiteralSchema, value: ValueSchema.pipe(z.string().min(1)) }))
  .min(1)
  .max(3);
export type RowCriteria = z.infer<typeof CriteriaSchema>;

export type RiskLevel = 'read' | 'write' | 'destructive';
export const RISK_ORDER: Record<RiskLevel, number> = { read: 0, write: 1, destructive: 2 };

export function riskOfControlName(name: string): RiskLevel {
  if (DESTRUCTIVE_PATTERN.test(name)) return 'destructive';
  if (WRITE_PATTERN.test(name)) return 'write';
  return 'read';
}

export function maxRisk(levels: RiskLevel[]): RiskLevel {
  return levels.reduce<RiskLevel>((max, level) => (RISK_ORDER[level] > RISK_ORDER[max] ? level : max), 'read');
}

// --- Gherkin rendering of targets and row criteria -------------------------------------

const PHRASE_TO_KIND = new Map<string, TargetKind>(TARGET_KIND_IDS.map((kind) => [TARGET_KINDS[kind].phrase, kind]));
const PHRASES_LONGEST_FIRST = [...PHRASE_TO_KIND.keys()].sort((a, b) => b.length - a.length);
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const TARGET_REGEX = new RegExp(`(${PHRASES_LONGEST_FIRST.map(escapeRegex).join('|')}) "([^"]*)"`);
export const CRITERIA_REGEX = /("[^"]+" es "[^"]*"(?: y "[^"]+" es "[^"]*")*)/;

export function renderTarget(target: Target): string {
  return `${TARGET_KINDS[target.kind].phrase} "${target.value}"`;
}

export function targetFromPhrase(phrase: string, value: string): Target {
  const kind = PHRASE_TO_KIND.get(phrase);
  if (!kind) throw new Error(`Tipo de elemento desconocido: ${phrase}`);
  return { kind, value };
}

export function renderCriteria(criteria: RowCriteria): string {
  return criteria.map((item) => `"${item.column}" es "${item.value}"`).join(' y ');
}

export function parseCriteria(text: string): RowCriteria {
  return [...text.matchAll(/"([^"]+)" es "([^"]*)"/g)].map((match) => ({ column: match[1], value: match[2] }));
}

export function describeTarget(target: Target): string {
  return renderTarget(target);
}

/** Parameter types registered both in Cucumber (runner) and in the validator's expression registry. */
export const PARAMETER_TYPES = [
  {
    name: 'elemento',
    regexp: TARGET_REGEX,
    transform: (phrase: string, value: string): Target => targetFromPhrase(phrase, value),
  },
  {
    name: 'criterios',
    regexp: CRITERIA_REGEX,
    transform: (text: string): RowCriteria => parseCriteria(text),
  },
] as const;

// --- Actions ---------------------------------------------------------------------------

export type ActionCategory = 'precondition' | 'navigation' | 'interaction' | 'assertion';

export interface ActionDefinition<P = any> {
  id: string;
  name: string;
  description: string;
  category: ActionCategory;
  keyword: 'Dado' | 'Cuando' | 'Entonces';
  expression: string;
  params: z.ZodType<P>;
  fromArgs: (args: unknown[]) => unknown;
  render: (params: P) => string;
  risk: (params: P) => RiskLevel;
  locatorRules: string;
  preconditions: string[];
  /** Whether the planner model may emit this action directly. */
  forModel: boolean;
  /** Model field hints shown in the planner prompt. */
  modelFields?: string;
  available: true;
}

function define<P>(definition: ActionDefinition<P>): ActionDefinition<P> {
  return definition;
}

const read = (): RiskLevel => 'read';
const target = targetSchema();
const field = targetSchema(FIELD_KINDS);

export const ACTIONS = [
  define({
    id: 'navigate_url',
    name: 'Abrir una ruta autorizada',
    description: 'Abre una ruta relativa a la URL base del proyecto. El origen se valida contra los orígenes autorizados.',
    category: 'precondition',
    keyword: 'Dado',
    expression: 'que abro la ruta {string}',
    params: z.object({ path: z.string().regex(/^\/[^\s"]*$/, 'Debe ser una ruta relativa que empiece por /').max(300) }),
    fromArgs: ([path]) => ({ path }),
    render: (p) => `que abro la ruta "${p.path}"`,
    risk: read,
    locatorRules: 'page.goto(baseUrl + path); solo orígenes autorizados.',
    preconditions: [],
    forModel: false,
    available: true,
  }),
  define({
    id: 'session_ready',
    name: 'Sesión iniciada',
    description: 'Comprueba que el contexto del navegador se creó con el estado de sesión guardado del proyecto.',
    category: 'precondition',
    keyword: 'Dado',
    expression: 'que la sesión está iniciada',
    params: z.object({}),
    fromArgs: () => ({}),
    render: () => 'que la sesión está iniciada',
    risk: read,
    locatorRules: 'Usa workspace/projects/<id>/auth/storage-state.json. Nunca credenciales en Gherkin.',
    preconditions: ['El proyecto tiene auth.mode = storage-state y el archivo existe.'],
    forModel: false,
    available: true,
  }),
  define({
    id: 'open_module',
    name: 'Abrir módulo o submódulo',
    description: 'Navega por el menú siguiendo la jerarquía observada (por ejemplo Catálogos > Productos) y verifica la ruta observada.',
    category: 'navigation',
    keyword: 'Cuando',
    expression: 'abro el módulo {string}',
    params: z.object({ path: z.array(LiteralSchema.refine((v) => !v.includes('>'), 'Sin ">"')).min(1).max(5) }),
    fromArgs: ([path]) => ({ path: String(path).split('>').map((segment) => segment.trim()).filter(Boolean) }),
    render: (p) => `abro el módulo "${p.path.join(' > ')}"`,
    risk: read,
    locatorRules: 'Dentro de los landmarks de navegación: link/button/menuitem con nombre exacto; los grupos se expanden con aria-expanded/aria-controls; si hay duplicados se desambigua por jerarquía o ruta observada.',
    preconditions: ['Mapa de navegación explorado (recomendado para verificar la ruta).'],
    forModel: true,
    modelFields: 'value = module path like "Parent > Child"',
    available: true,
  }),
  define({
    id: 'click',
    name: 'Pulsar un elemento',
    description: 'Hace clic en un único elemento resuelto por rol y nombre accesible, etiqueta, texto, título o test id.',
    category: 'interaction',
    keyword: 'Cuando',
    expression: 'pulso {elemento}',
    params: z.object({ target: targetSchema(CLICK_KINDS) }),
    fromArgs: ([t]) => ({ target: t }),
    render: (p) => `pulso ${renderTarget(p.target)}`,
    risk: (p) => riskOfControlName(p.target.value),
    locatorRules: 'Debe existir exactamente un elemento visible; si hay varios se rechaza por ambigüedad.',
    preconditions: [],
    forModel: true,
    modelFields: 'element',
    available: true,
  }),
  define({
    id: 'click_popup',
    name: 'Pulsar y cambiar a la pestaña nueva',
    description: 'Hace clic en un elemento que abre una pestaña o ventana emergente y la convierte en la página activa.',
    category: 'interaction',
    keyword: 'Cuando',
    expression: 'pulso {elemento} y se abre una nueva pestaña',
    params: z.object({ target: targetSchema(CLICK_KINDS) }),
    fromArgs: ([t]) => ({ target: t }),
    render: (p) => `pulso ${renderTarget(p.target)} y se abre una nueva pestaña`,
    risk: (p) => riskOfControlName(p.target.value),
    locatorRules: 'Igual que click; espera el evento popup del contexto.',
    preconditions: [],
    forModel: true,
    modelFields: 'element',
    available: true,
  }),
  define({
    id: 'switch_main',
    name: 'Volver a la pestaña principal',
    description: 'Vuelve a usar la primera página del escenario como página activa.',
    category: 'interaction',
    keyword: 'Cuando',
    expression: 'vuelvo a la pestaña principal',
    params: z.object({}),
    fromArgs: () => ({}),
    render: () => 'vuelvo a la pestaña principal',
    risk: read,
    locatorRules: 'Sin localizador.',
    preconditions: [],
    forModel: true,
    available: true,
  }),
  define({
    id: 'row_action',
    name: 'Pulsar un control de una fila',
    description: 'Localiza exactamente una fila de la tabla cuyas columnas tienen los valores indicados y pulsa un control dentro de esa fila.',
    category: 'interaction',
    keyword: 'Cuando',
    expression: 'pulso {elemento} en la fila donde {criterios}',
    params: z.object({ target: targetSchema(ROW_CONTROL_KINDS), criteria: CriteriaSchema }),
    fromArgs: ([t, criteria]) => ({ target: t, criteria }),
    render: (p) => `pulso ${renderTarget(p.target)} en la fila donde ${renderCriteria(p.criteria)}`,
    risk: (p) => riskOfControlName(p.target.value),
    locatorRules: 'Columnas por encabezado; valores con coincidencia exacta; debe haber exactamente una fila; el control se busca solo dentro de esa fila (nombre parcial, p. ej. "Editar" coincide con "Editar Ana").',
    preconditions: ['Tabla visible con encabezados.'],
    forModel: true,
    modelFields: 'element = row control id; row = [{column, value}] identifying the record',
    available: true,
  }),
  define({
    id: 'fill',
    name: 'Rellenar un campo',
    description: 'Escribe un valor en un único campo editable.',
    category: 'interaction',
    keyword: 'Cuando',
    expression: 'relleno {elemento} con {string}',
    params: z.object({ target: field, value: ValueSchema.pipe(z.string().min(1)) }),
    fromArgs: ([t, value]) => ({ target: t, value }),
    render: (p) => `relleno ${renderTarget(p.target)} con "${p.value}"`,
    risk: read,
    locatorRules: 'Campo editable único; se rechazan campos de contraseña.',
    preconditions: [],
    forModel: true,
    modelFields: 'element, value',
    available: true,
  }),
  define({
    id: 'clear',
    name: 'Limpiar un campo',
    description: 'Vacía un único campo editable.',
    category: 'interaction',
    keyword: 'Cuando',
    expression: 'limpio {elemento}',
    params: z.object({ target: field }),
    fromArgs: ([t]) => ({ target: t }),
    render: (p) => `limpio ${renderTarget(p.target)}`,
    risk: read,
    locatorRules: 'Campo editable único.',
    preconditions: [],
    forModel: true,
    modelFields: 'element',
    available: true,
  }),
  define({
    id: 'select_option',
    name: 'Seleccionar una opción',
    description: 'Selecciona una opción por su texto visible en un desplegable nativo o con rol combobox/listbox.',
    category: 'interaction',
    keyword: 'Cuando',
    expression: 'selecciono {string} en {elemento}',
    params: z.object({ target: targetSchema(SELECT_KINDS), option: LiteralSchema }),
    fromArgs: ([option, t]) => ({ target: t, option }),
    render: (p) => `selecciono "${p.option}" en ${renderTarget(p.target)}`,
    risk: read,
    locatorRules: '<select>: selectOption por etiqueta; otros: clic y option con nombre exacto.',
    preconditions: [],
    forModel: true,
    modelFields: 'element, value = option label',
    available: true,
  }),
  define({
    id: 'check',
    name: 'Marcar',
    description: 'Marca una casilla, radio o interruptor.',
    category: 'interaction',
    keyword: 'Cuando',
    expression: 'marco {elemento}',
    params: z.object({ target: targetSchema(TOGGLE_KINDS) }),
    fromArgs: ([t]) => ({ target: t }),
    render: (p) => `marco ${renderTarget(p.target)}`,
    risk: read,
    locatorRules: 'Control único con rol checkbox/radio/switch.',
    preconditions: [],
    forModel: true,
    modelFields: 'element',
    available: true,
  }),
  define({
    id: 'uncheck',
    name: 'Desmarcar',
    description: 'Desmarca una casilla o interruptor.',
    category: 'interaction',
    keyword: 'Cuando',
    expression: 'desmarco {elemento}',
    params: z.object({ target: targetSchema(TOGGLE_KINDS) }),
    fromArgs: ([t]) => ({ target: t }),
    render: (p) => `desmarco ${renderTarget(p.target)}`,
    risk: read,
    locatorRules: 'Control único con rol checkbox/switch.',
    preconditions: [],
    forModel: true,
    modelFields: 'element',
    available: true,
  }),
  define({
    id: 'press_key',
    name: 'Pulsar una tecla',
    description: `Pulsa una tecla admitida: ${ALLOWED_KEYS.join(', ')}.`,
    category: 'interaction',
    keyword: 'Cuando',
    expression: 'pulso la tecla {string}',
    params: z.object({ key: z.enum(ALLOWED_KEYS) }),
    fromArgs: ([key]) => ({ key }),
    render: (p) => `pulso la tecla "${p.key}"`,
    risk: read,
    locatorRules: 'Se envía a la página activa.',
    preconditions: [],
    forModel: true,
    modelFields: 'value = key name',
    available: true,
  }),
  define({
    id: 'expect_visible',
    name: 'Verificar que se ve',
    description: 'Comprueba que al menos un elemento coincidente está visible.',
    category: 'assertion',
    keyword: 'Entonces',
    expression: 'veo {elemento}',
    params: z.object({ target }),
    fromArgs: ([t]) => ({ target: t }),
    render: (p) => `veo ${renderTarget(p.target)}`,
    risk: read,
    locatorRules: 'Aserción web-first con espera automática.',
    preconditions: [],
    forModel: true,
    modelFields: 'element, or target = exact visible text the user expects',
    available: true,
  }),
  define({
    id: 'expect_hidden',
    name: 'Verificar que no se ve',
    description: 'Comprueba que ningún elemento coincidente está visible.',
    category: 'assertion',
    keyword: 'Entonces',
    expression: 'no veo {elemento}',
    params: z.object({ target }),
    fromArgs: ([t]) => ({ target: t }),
    render: (p) => `no veo ${renderTarget(p.target)}`,
    risk: read,
    locatorRules: 'Espera hasta que no quede ninguno visible.',
    preconditions: [],
    forModel: true,
    modelFields: 'element, or target = exact text',
    available: true,
  }),
  define({
    id: 'expect_contains_text',
    name: 'Verificar texto de un elemento',
    description: 'Comprueba que un único elemento contiene un texto.',
    category: 'assertion',
    keyword: 'Entonces',
    expression: '{elemento} contiene el texto {string}',
    params: z.object({ target, text: LiteralSchema }),
    fromArgs: ([t, text]) => ({ target: t, text }),
    render: (p) => `${renderTarget(p.target)} contiene el texto "${p.text}"`,
    risk: read,
    locatorRules: 'Elemento único.',
    preconditions: [],
    forModel: true,
    modelFields: 'element, value = expected text',
    available: true,
  }),
  define({
    id: 'expect_value',
    name: 'Verificar valor de un campo',
    description: 'Comprueba el valor actual de un campo único.',
    category: 'assertion',
    keyword: 'Entonces',
    expression: '{elemento} tiene el valor {string}',
    params: z.object({ target: field, value: ValueSchema }),
    fromArgs: ([t, value]) => ({ target: t, value }),
    render: (p) => `${renderTarget(p.target)} tiene el valor "${p.value}"`,
    risk: read,
    locatorRules: 'Campo único.',
    preconditions: [],
    forModel: true,
    modelFields: 'element, value',
    available: true,
  }),
  define({
    id: 'expect_count',
    name: 'Contar elementos',
    description: 'Comprueba cuántos elementos visibles coinciden.',
    category: 'assertion',
    keyword: 'Entonces',
    expression: 'veo {int} veces {elemento}',
    params: z.object({ target, count: z.number().int().min(0).max(500) }),
    fromArgs: ([count, t]) => ({ target: t, count }),
    render: (p) => `veo ${p.count} veces ${renderTarget(p.target)}`,
    risk: read,
    locatorRules: 'Cuenta solo elementos visibles.',
    preconditions: [],
    forModel: true,
    modelFields: 'element, value = number',
    available: true,
  }),
  define({
    id: 'expect_url',
    name: 'Verificar URL',
    description: 'Comprueba que la URL de la página activa contiene un fragmento.',
    category: 'assertion',
    keyword: 'Entonces',
    expression: 'la URL contiene {string}',
    params: z.object({ fragment: LiteralSchema }),
    fromArgs: ([fragment]) => ({ fragment }),
    render: (p) => `la URL contiene "${p.fragment}"`,
    risk: read,
    locatorRules: 'toHaveURL con el fragmento escapado.',
    preconditions: [],
    forModel: true,
    modelFields: 'value = url fragment',
    available: true,
  }),
  define({
    id: 'expect_row',
    name: 'Verificar que existe una fila',
    description: 'Comprueba que la tabla muestra al menos una fila con esos valores exactos.',
    category: 'assertion',
    keyword: 'Entonces',
    expression: 'la tabla muestra una fila donde {criterios}',
    params: z.object({ criteria: CriteriaSchema }),
    fromArgs: ([criteria]) => ({ criteria }),
    render: (p) => `la tabla muestra una fila donde ${renderCriteria(p.criteria)}`,
    risk: read,
    locatorRules: 'Columnas por encabezado, valores exactos.',
    preconditions: [],
    forModel: true,
    modelFields: 'row = [{column, value}]',
    available: true,
  }),
  define({
    id: 'expect_no_row',
    name: 'Verificar que no existe una fila',
    description: 'Comprueba que la tabla no muestra filas con esos valores exactos.',
    category: 'assertion',
    keyword: 'Entonces',
    expression: 'la tabla no muestra filas donde {criterios}',
    params: z.object({ criteria: CriteriaSchema }),
    fromArgs: ([criteria]) => ({ criteria }),
    render: (p) => `la tabla no muestra filas donde ${renderCriteria(p.criteria)}`,
    risk: read,
    locatorRules: 'Columnas por encabezado, valores exactos.',
    preconditions: [],
    forModel: true,
    modelFields: 'row = [{column, value}]',
    available: true,
  }),
  define({
    id: 'expect_row_count',
    name: 'Contar filas',
    description: 'Comprueba el número de filas de datos de la tabla.',
    category: 'assertion',
    keyword: 'Entonces',
    expression: 'la tabla muestra {int} filas',
    params: z.object({ count: z.number().int().min(0).max(1000) }),
    fromArgs: ([count]) => ({ count }),
    render: (p) => `la tabla muestra ${p.count} filas`,
    risk: read,
    locatorRules: 'Filas con celdas de datos (sin encabezados).',
    preconditions: [],
    forModel: true,
    modelFields: 'value = number',
    available: true,
  }),
  define({
    id: 'expect_column_all',
    name: 'Verificar una columna en todas las filas',
    description: 'Comprueba que hay filas y que todas tienen ese valor exacto en la columna.',
    category: 'assertion',
    keyword: 'Entonces',
    expression: 'todas las filas tienen {string} igual a {string}',
    params: z.object({ column: LiteralSchema, value: LiteralSchema }),
    fromArgs: ([column, value]) => ({ column, value }),
    render: (p) => `todas las filas tienen "${p.column}" igual a "${p.value}"`,
    risk: read,
    locatorRules: 'Columnas por encabezado; requiere al menos una fila.',
    preconditions: [],
    forModel: true,
    modelFields: 'row = [{column, value}] (one item)',
    available: true,
  }),
];

export type ActionId = (typeof ACTIONS)[number]['id'];
export const ACTION_IDS = ACTIONS.map((action) => action.id);
export const MODEL_ACTION_IDS = ACTIONS.filter((action) => action.forModel).map((action) => action.id);
const BY_ID = new Map(ACTIONS.map((action) => [action.id, action as ActionDefinition]));

export function getAction(id: string): ActionDefinition | undefined {
  return BY_ID.get(id);
}

export function catalogSummary() {
  return {
    version: CATALOG_VERSION,
    generatorVersion: GENERATOR_VERSION,
    actions: ACTIONS.map((action) => ({
      id: action.id,
      name: action.name,
      description: action.description,
      category: action.category,
      keyword: action.keyword,
      expression: action.expression,
      locatorRules: action.locatorRules,
      preconditions: action.preconditions,
      available: action.available,
    })),
    targets: TARGET_KIND_IDS.map((kind) => ({ kind, phrase: TARGET_KINDS[kind].phrase })),
  };
}
