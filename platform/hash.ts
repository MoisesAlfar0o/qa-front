import { createHash, randomBytes } from 'node:crypto';

import { stableStringify } from './text.ts';

/**
 * Canonical form of a .feature before hashing and storing: UTF-8 without BOM,
 * LF line endings, no trailing whitespace at the end of the document and exactly
 * one final newline. Stored versions are always written in this form, so the
 * SHA-256 of the file bytes on disk must equal the recorded hash.
 */
export function canonicalFeature(text: string): string {
  return `${text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\s+$/, '')}\n`;
}

export function sha256(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

export function hashObject(value: unknown): string {
  return sha256(stableStringify(value));
}

export function randomId(prefix: string): string {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `${prefix}-${stamp}-${randomBytes(3).toString('hex')}`;
}
