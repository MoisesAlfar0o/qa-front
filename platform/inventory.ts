import type { Target } from './catalog.ts';

export type EvidenceSource = 'playwright-dom' | 'mcp-aria';

export interface Evidence {
  source: EvidenceSource;
  url: string;
  observedAt: string;
}

export interface LocatorCandidate {
  target: Target;
  /** Matches counted by Playwright on the live page when observed; null when not measurable (MCP). */
  count: number | null;
}

export interface ObservedElement {
  id: string;
  pageId: string;
  role: string;
  name: string;
  nameSource: 'aria-label' | 'aria-labelledby' | 'label' | 'text' | 'title' | 'placeholder' | 'alt' | 'none';
  tag: string;
  inputType?: string;
  label?: string;
  placeholder?: string;
  testId?: string;
  title?: string;
  text?: string;
  href?: string;
  opensPopup?: boolean;
  inNavigation: boolean;
  visible: boolean;
  locators: LocatorCandidate[];
  evidence: Evidence;
}

export interface RowControl {
  id: string;
  role: string;
  /** Accessible name observed on the first row, e.g. "Editar Moisés". */
  observedName: string;
  /** Name with the row's own cell value removed, e.g. "Editar"; empty when the control has no name. */
  baseName: string;
  /** Column whose value appears inside the name ("Nombre"), if any. */
  nameIncludesColumn?: string;
  title?: string;
  testId?: string;
  iconText?: string;
  hasAccessibleName: boolean;
  /** Target to use inside the row, or null when the control cannot be identified safely. */
  target: Target | null;
  explored?: { stateId: string; outcome: string };
}

export interface ObservedTable {
  id: string;
  pageId: string;
  name: string;
  headers: string[];
  rowCount: number;
  sampleRows: string[][];
  rowControls: RowControl[];
  evidence: Evidence;
}

export interface ObservedPage {
  id: string;
  kind: 'page' | 'state';
  url: string;
  path: string;
  title: string;
  headings: string[];
  breadcrumbs: string[];
  navNodeId: string | null;
  /** For states (forms/dialogs opened from a page): the page and control that opened it. */
  parentPageId?: string;
  trigger?: string;
  elements: ObservedElement[];
  tables: ObservedTable[];
  dialogs: string[];
  observedAt: string;
  source: EvidenceSource;
  /** Workspace-relative path of the raw MCP ARIA snapshot of this page, when MCP observed it. */
  mcpSnapshot?: string;
  stale?: boolean;
}

export interface Inventory {
  projectId: string;
  exploredAt: string;
  source: EvidenceSource;
  baseUrl: string;
  pages: ObservedPage[];
  warnings: string[];
  mcp: McpReport;
}

export interface McpReport {
  used: boolean;
  reason?: string;
  serverVersion?: string;
  toolsAvailable: string[];
  calls: { tool: string; ok: boolean; ms: number }[];
  pagesSnapshotted: number;
  navLinks: number;
  /** Role/name pairs MCP saw on a page that the DOM inventory did not record. */
  unmatched: number;
}

export const INVENTORY_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function allElements(inventory: Inventory | null): ObservedElement[] {
  return inventory?.pages.flatMap((page) => page.elements) ?? [];
}

export function allTables(inventory: Inventory | null): ObservedTable[] {
  return inventory?.pages.flatMap((page) => page.tables) ?? [];
}

export function findPage(inventory: Inventory | null, pageId: string): ObservedPage | undefined {
  return inventory?.pages.find((page) => page.id === pageId);
}

/** Pages that belong to a navigation node, including states opened from them. */
export function pagesForNode(inventory: Inventory | null, nodeId: string | null): Set<string> {
  const ids = new Set<string>();
  if (!inventory || !nodeId) return ids;
  for (const page of inventory.pages) if (page.navNodeId === nodeId) ids.add(page.id);
  for (const page of inventory.pages) if (page.parentPageId && ids.has(page.parentPageId)) ids.add(page.id);
  return ids;
}

/** Best unique locator: accessible role/name first, then label, placeholder, text, test id, title. */
export function bestLocator(element: ObservedElement, allowedKinds?: readonly string[]): LocatorCandidate | null {
  const candidates = element.locators.filter((candidate) => !allowedKinds || allowedKinds.includes(candidate.target.kind));
  return candidates.find((candidate) => candidate.count === 1) ?? candidates.find((candidate) => candidate.count === null) ?? null;
}

export function isInventoryStale(inventory: Inventory | null, now = Date.now()): boolean {
  return !inventory || now - Date.parse(inventory.exploredAt) > INVENTORY_STALE_AFTER_MS;
}
