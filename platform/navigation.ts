import type { Target } from './catalog.ts';
import type { EvidenceSource } from './inventory.ts';
import { keywords, normalizeText, sameName, slugify } from './text.ts';

export type NavNodeKind = 'module' | 'submodule' | 'page' | 'tab' | 'section';

export interface NavNode {
  id: string;
  name: string;
  normalized: string;
  parentId: string | null;
  path: string[];
  route: string | null;
  aliases: string[];
  breadcrumbs: string[];
  kind: NavNodeKind;
  navRef: Target | null;
  evidence: { source: EvidenceSource; url: string; observedAt: string };
  status: 'verified' | 'stale';
}

export interface NavigationMap {
  projectId: string;
  builtAt: string;
  nodes: NavNode[];
}

/** One menu entry observed on a page: its full label path and, for links, the route it points to. */
export interface NavObservation {
  path: string[];
  route: string | null;
  control: 'link' | 'button';
  url: string;
  source: EvidenceSource;
}

export function nodeId(path: string[]): string {
  return `nav-${slugify(path.join(' '), 70)}`;
}

export function buildNavigation(
  projectId: string,
  observations: NavObservation[],
  previous: NavigationMap | null,
  observedAt: string,
  extras: { routeHeadings?: Map<string, string[]>; routeBreadcrumbs?: Map<string, string[]> } = {},
): NavigationMap {
  const nodes = new Map<string, NavNode>();
  for (const observation of observations) {
    const path = observation.path.map((segment) => segment.trim()).filter(Boolean);
    for (let depth = 0; depth < path.length; depth += 1) {
      const prefix = path.slice(0, depth + 1);
      const id = nodeId(prefix);
      const isLeaf = depth === path.length - 1;
      const existing = nodes.get(id);
      const route = isLeaf ? observation.route : existing?.route ?? null;
      const name = prefix[depth];
      const node: NavNode = existing ?? {
        id,
        name,
        normalized: normalizeText(name),
        parentId: depth === 0 ? null : nodeId(path.slice(0, depth)),
        path: prefix,
        route: null,
        aliases: [],
        breadcrumbs: [],
        kind: 'page',
        navRef: null,
        evidence: { source: observation.source, url: observation.url, observedAt },
        status: 'verified',
      };
      if (route && !node.route) node.route = route;
      node.navRef = isLeaf && observation.control === 'link' ? { kind: 'link', value: name } : node.navRef ?? { kind: 'button', value: name };
      nodes.set(id, node);
    }
  }

  for (const node of nodes.values()) {
    const hasChildren = [...nodes.values()].some((other) => other.parentId === node.id);
    node.kind = hasChildren ? 'module' : node.path.length > 1 ? 'submodule' : 'page';
    const aliases = new Set<string>([normalizeText(node.name), keywords(node.name).join(' ')]);
    if (node.route) {
      for (const heading of extras.routeHeadings?.get(node.route) ?? []) aliases.add(normalizeText(heading));
      node.breadcrumbs = extras.routeBreadcrumbs?.get(node.route) ?? [];
    }
    node.aliases = [...aliases].filter(Boolean);
  }

  // Nodes seen before but not in this exploration are kept and flagged as possibly stale.
  for (const old of previous?.nodes ?? []) {
    if (!nodes.has(old.id)) nodes.set(old.id, { ...old, status: 'stale' });
  }

  return { projectId, builtAt: observedAt, nodes: [...nodes.values()].sort((a, b) => a.path.join('/').localeCompare(b.path.join('/'))) };
}

const FILLER = /\b(el|la|los|las|al|del|modulo|módulo|submodulo|submódulo|seccion|sección|pantalla|pagina|página|menu|menú|opcion|opción|lista de|listado de|apartado)\b/giu;

/** Splits "Catálogos > Productos", "Catálogos/Productos", "Productos dentro de Catálogos"… into ordered segments. */
export function parseNavigationExpression(expression: string | string[]): string[] {
  if (Array.isArray(expression)) return expression.flatMap((segment) => parseNavigationExpression(segment));
  const text = expression.trim();
  const inside = text.match(/^(.*?)\s+(?:dentro de|en el módulo de|en el módulo|bajo|de la sección)\s+(.*)$/i);
  if (inside) return [...parseNavigationExpression(inside[2]), ...parseNavigationExpression(inside[1])];
  return text
    .split(/\s*(?:>|\/|»|›|→|\\|\|)\s*/)
    .map((segment) => segment.replace(FILLER, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export type NavigationResolution =
  | { status: 'resolved'; node: NavNode; segments: string[]; warnings: string[] }
  | { status: 'ambiguous'; candidates: NavNode[]; segments: string[] }
  | { status: 'not_found'; segments: string[]; suggestions: NavNode[] }
  | { status: 'empty'; segments: string[] };

function segmentMatches(node: NavNode, segment: string): boolean {
  return sameName(node.name, segment) || node.aliases.includes(normalizeText(segment)) || node.aliases.includes(keywords(segment).join(' '));
}

/**
 * Resolves user segments to one node. The last segment must match the node itself and the
 * remaining segments must match its ancestors in order (gaps allowed). Several matches are
 * reported as ambiguous instead of picking one.
 */
export function resolveNavigation(map: NavigationMap | null, expression: string | string[]): NavigationResolution {
  const segments = parseNavigationExpression(expression);
  if (!map || map.nodes.length === 0) return { status: 'empty', segments };
  if (segments.length === 0) return { status: 'not_found', segments, suggestions: [] };
  const byId = new Map(map.nodes.map((node) => [node.id, node]));
  const last = segments[segments.length - 1];
  const ancestorsOf = (node: NavNode) => {
    const chain: NavNode[] = [];
    let current = node.parentId ? byId.get(node.parentId) : undefined;
    while (current) {
      chain.unshift(current);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return chain;
  };

  const matches = map.nodes.filter((node) => {
    if (!segmentMatches(node, last)) return false;
    const ancestors = ancestorsOf(node);
    let cursor = 0;
    for (const segment of segments.slice(0, -1)) {
      while (cursor < ancestors.length && !segmentMatches(ancestors[cursor], segment)) cursor += 1;
      if (cursor >= ancestors.length) return false;
      cursor += 1;
    }
    return true;
  });

  const verified = matches.filter((node) => node.status === 'verified');
  const pool = verified.length ? verified : matches;
  // Prefer a navigable leaf over a group with the same name.
  const routed = pool.filter((node) => node.route);
  const finalPool = routed.length ? routed : pool;
  if (finalPool.length === 1) {
    const warnings = finalPool[0].status === 'stale' ? [`El destino ${finalPool[0].path.join(' > ')} no se vio en la última exploración.`] : [];
    return { status: 'resolved', node: finalPool[0], segments, warnings };
  }
  if (finalPool.length > 1) return { status: 'ambiguous', candidates: finalPool, segments };
  const lastKeywords = new Set(keywords(last));
  const suggestions = map.nodes.filter((node) => keywords(node.name).some((token) => lastKeywords.has(token))).slice(0, 5);
  return { status: 'not_found', segments, suggestions };
}

export function nodeForRoute(map: NavigationMap | null, routePath: string): NavNode | null {
  return map?.nodes.find((node) => node.route === routePath) ?? null;
}
