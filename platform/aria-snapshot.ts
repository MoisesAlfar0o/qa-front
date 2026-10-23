/**
 * Parser for the ARIA snapshot YAML emitted by Playwright (`locator.ariaSnapshot()` and the
 * Playwright MCP `browser_snapshot` tool), e.g.
 *
 *   - navigation "Menú principal" [ref=e8]:
 *     - button "Catálogos" [expanded] [ref=e13] [cursor=pointer]
 *     - link "Productos" [ref=e16]:
 *       - /url: /lab/catalogos/productos
 *
 * Snapshot content comes from the target page and is treated as untrusted text: it is only
 * parsed into plain data, never evaluated.
 */

export interface AriaNode {
  role: string;
  name: string;
  attributes: Record<string, string | true>;
  text: string;
  props: Record<string, string>;
  children: AriaNode[];
  parent: AriaNode | null;
}

const LINE = /^(\s*)- (.*)$/;
const MAX_LINES = 20_000;

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1).replace(/''/g, "'");
  return trimmed;
}

function readQuoted(text: string): { value: string; rest: string } | null {
  if (!text.startsWith('"')) return null;
  for (let index = 1; index < text.length; index += 1) {
    if (text[index] === '\\') {
      index += 1;
      continue;
    }
    if (text[index] === '"') return { value: unquote(text.slice(0, index + 1)), rest: text.slice(index + 1).trimStart() };
  }
  return null;
}

function parseEntry(content: string): Omit<AriaNode, 'children' | 'parent'> | { prop: string; value: string } {
  let rest = content.trim();
  if (rest.startsWith('/')) {
    const colon = rest.indexOf(':');
    return colon === -1 ? { prop: rest.slice(1), value: '' } : { prop: rest.slice(1, colon), value: unquote(rest.slice(colon + 1)) };
  }
  const roleMatch = /^([a-zA-Z][\w-]*)/.exec(rest);
  if (!roleMatch || (rest[roleMatch[0].length] !== undefined && !/[\s:[]/.test(rest[roleMatch[0].length]))) {
    return { role: 'text', name: '', attributes: {}, text: unquote(rest.replace(/:$/, '')), props: {} };
  }
  const role = roleMatch[1];
  rest = rest.slice(role.length).trimStart();
  let name = '';
  const quoted = readQuoted(rest);
  if (quoted) {
    name = quoted.value;
    rest = quoted.rest;
  }
  const attributes: Record<string, string | true> = {};
  while (rest.startsWith('[')) {
    const end = rest.indexOf(']');
    if (end === -1) break;
    const inner = rest.slice(1, end);
    const eq = inner.indexOf('=');
    if (eq === -1) attributes[inner] = true;
    else attributes[inner.slice(0, eq)] = inner.slice(eq + 1);
    rest = rest.slice(end + 1).trimStart();
  }
  let text = '';
  if (rest.startsWith(':')) text = unquote(rest.slice(1));
  return { role, name, attributes, text, props: {} };
}

export function parseAriaSnapshot(yaml: string): AriaNode {
  const root: AriaNode = { role: 'root', name: '', attributes: {}, text: '', props: {}, children: [], parent: null };
  const stack: { indent: number; node: AriaNode }[] = [{ indent: -1, node: root }];
  const lines = yaml.split(/\r?\n/).slice(0, MAX_LINES);
  for (const line of lines) {
    const match = LINE.exec(line);
    if (!match) continue;
    const indent = match[1].length;
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1].node;
    const entry = parseEntry(match[2]);
    if ('prop' in entry) {
      parent.props[entry.prop] = entry.value;
      continue;
    }
    const node: AriaNode = { ...entry, children: [], parent };
    parent.children.push(node);
    stack.push({ indent, node });
  }
  return root;
}

/** Extracts the YAML block from an MCP tool text response ("### Snapshot\n```yaml\n…```"). */
export function extractSnapshotYaml(text: string): string | null {
  const match = text.match(/```yaml\r?\n([\s\S]*?)```/);
  return match ? match[1] : null;
}

export function walk(node: AriaNode, visit: (node: AriaNode) => void): void {
  for (const child of node.children) {
    visit(child);
    walk(child, visit);
  }
}

export function findAll(node: AriaNode, predicate: (node: AriaNode) => boolean): AriaNode[] {
  const found: AriaNode[] = [];
  walk(node, (child) => {
    if (predicate(child)) found.push(child);
  });
  return found;
}

function textOf(node: AriaNode): string {
  if (node.name) return node.name;
  if (node.text) return node.text;
  return node.children.map(textOf).filter(Boolean).join(' ');
}

const BREADCRUMB_LABEL = /breadcrumb|ruta de navegaci|migas/i;

export function isBreadcrumbs(node: AriaNode): boolean {
  return node.role === 'navigation' && BREADCRUMB_LABEL.test(node.name);
}

export function menuLandmarks(root: AriaNode): AriaNode[] {
  return findAll(root, (node) => node.role === 'navigation' && !isBreadcrumbs(node));
}

/** Label of the group that owns a nested list: the button/menuitem sibling preceding it. */
function groupLabel(list: AriaNode): string | null {
  const parent = list.parent;
  if (!parent) return null;
  const index = parent.children.indexOf(list);
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const sibling = parent.children[cursor];
    if (['button', 'menuitem', 'link', 'generic', 'text'].includes(sibling.role)) {
      const label = textOf(sibling).trim();
      if (label) return label;
    }
  }
  return null;
}

export interface AriaNavLink {
  path: string[];
  route: string | null;
}

/** Menu links with their full group path (e.g. ["Catálogos", "Productos"]). */
export function navLinks(root: AriaNode): AriaNavLink[] {
  const links: AriaNavLink[] = [];
  for (const landmark of menuLandmarks(root)) {
    for (const link of findAll(landmark, (node) => node.role === 'link' || node.role === 'menuitem')) {
      const name = textOf(link).trim();
      if (!name) continue;
      const path = [name];
      let cursor: AriaNode | null = link.parent;
      while (cursor && cursor !== landmark) {
        if (['list', 'menu', 'group', 'tree'].includes(cursor.role) && cursor.parent && cursor.parent !== landmark) {
          const label = groupLabel(cursor);
          if (label && label !== path[0]) path.unshift(label);
        }
        cursor = cursor.parent;
      }
      links.push({ path, route: link.props.url ?? null });
    }
  }
  return links;
}

/** Menu buttons that may expand a group and are not already expanded. */
export function collapsedMenuButtons(root: AriaNode): { name: string; ref: string }[] {
  return menuLandmarks(root)
    .flatMap((landmark) => findAll(landmark, (node) => node.role === 'button' && node.attributes.expanded === undefined))
    .map((node) => ({ name: textOf(node).trim(), ref: typeof node.attributes.ref === 'string' ? node.attributes.ref : '' }))
    .filter((item) => item.name && item.ref);
}

export function headings(root: AriaNode): string[] {
  return findAll(root, (node) => node.role === 'heading').map(textOf).filter(Boolean);
}

export function breadcrumbs(root: AriaNode): string[] {
  const nav = findAll(root, isBreadcrumbs)[0];
  if (!nav) return [];
  return findAll(nav, (node) => node.role === 'listitem' || node.role === 'link').map((node) => textOf(node).replace(/^\s*[/>›»]\s*/, '').trim()).filter(Boolean);
}

export interface AriaElement {
  role: string;
  name: string;
}

const INTERACTIVE = new Set(['button', 'link', 'tab', 'checkbox', 'radio', 'switch', 'menuitem', 'heading', 'dialog', 'combobox', 'textbox', 'searchbox', 'spinbutton']);

function insideRow(node: AriaNode): boolean {
  for (let cursor = node.parent; cursor; cursor = cursor.parent) if (cursor.role === 'row') return true;
  return false;
}

/** Role/name pairs of interactive elements outside table rows, used to cross-check the DOM inventory. */
export function interactiveElements(root: AriaNode): AriaElement[] {
  return findAll(root, (node) => INTERACTIVE.has(node.role) && !insideRow(node)).map((node) => ({ role: node.role, name: node.name }));
}

export interface AriaTable {
  name: string;
  headers: string[];
  rowCount: number;
}

export function tables(root: AriaNode): AriaTable[] {
  return findAll(root, (node) => node.role === 'table' || node.role === 'grid').map((table) => {
    const rows = findAll(table, (node) => node.role === 'row');
    const headerRow = rows.find((row) => row.children.some((cell) => cell.role === 'columnheader'));
    return {
      name: table.name,
      headers: headerRow ? headerRow.children.filter((cell) => cell.role === 'columnheader').map(textOf) : [],
      rowCount: rows.filter((row) => row !== headerRow).length,
    };
  });
}
