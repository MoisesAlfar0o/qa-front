// Pure helpers shared by the backend and the browser bundle. No Node imports here.

const STOP_WORDS = new Set([
  'a', 'al', 'con', 'de', 'del', 'e', 'el', 'en', 'la', 'las', 'lo', 'los', 'o', 'para', 'por', 'que', 'se', 'su', 'sus', 'un', 'una', 'y',
  'the', 'of', 'to', 'in', 'on', 'and', 'for',
]);

export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function stem(token: string): string {
  if (token.length > 5 && token.endsWith('es')) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

export function keywords(value: string): string[] {
  return normalizeText(value).split(' ').filter((token) => token && !STOP_WORDS.has(token)).map(stem);
}

export function sameName(left: string, right: string): boolean {
  const a = keywords(left).join(' ');
  return a.length > 0 && a === keywords(right).join(' ');
}

export function slugify(value: string, maxLength = 48): string {
  const slug = normalizeText(value).replace(/\s+/g, '-').slice(0, maxLength).replace(/-+$/g, '');
  return slug || 'item';
}

export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}

export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
