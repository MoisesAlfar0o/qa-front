import path from 'node:path';

export class SecurityError extends Error {
  override name = 'SecurityError';
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** Extra hosts can only be authorized by whoever starts the server (QA_ALLOWED_HOSTS), never through the API or the model. */
export function extraAllowedHosts(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set(
    (env.QA_ALLOWED_HOSTS ?? '')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAuthorizedHost(hostname: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const host = hostname.toLowerCase();
  return LOOPBACK_HOSTS.has(host) || extraAllowedHosts(env).has(host);
}

export function validateTargetUrl(value: unknown, env: NodeJS.ProcessEnv = process.env): URL {
  if (typeof value !== 'string' || value.length > 500) throw new SecurityError('La URL debe ser un texto de hasta 500 caracteres.');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SecurityError('Escribe una URL válida, por ejemplo http://127.0.0.1:4173/lab.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new SecurityError('Solo se permiten URLs http o https.');
  if (url.username || url.password) throw new SecurityError('No incluyas credenciales en la URL.');
  if (!isAuthorizedHost(url.hostname, env)) {
    throw new SecurityError(
      `El host ${url.hostname} no está autorizado. Por defecto solo se permite localhost; para otro ambiente de pruebas, inicia el servidor con QA_ALLOWED_HOSTS=${url.hostname}.`,
    );
  }
  return url;
}

export function isAllowedOrigin(url: string, allowedOrigins: readonly string[]): boolean {
  try {
    return allowedOrigins.includes(new URL(url).origin);
  } catch {
    return false;
  }
}

const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;

export function assertSafeId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) throw new SecurityError(`Identificador de ${label} no válido.`);
  return value;
}

/** Resolves a path below root and rejects anything that escapes it (path traversal). */
export function resolveInside(root: string, ...segments: string[]): string {
  const base = path.resolve(root);
  const target = path.resolve(base, ...segments);
  const relative = path.relative(base, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new SecurityError('Ruta fuera del workspace.');
  return target;
}

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/(authorization|cookie|set-cookie)\s*[:=]\s*[^\n]+/gi, '$1: [REDACTADO]'],
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/g, 'Bearer [REDACTADO]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[JWT REDACTADO]'],
  [/((?:password|passwd|contraseña|secret|token|api[_-]?key)\s*[:=]\s*)\S+/gi, '$1[REDACTADO]'],
];

export function redact(text: string): string {
  return SECRET_PATTERNS.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), text);
}
