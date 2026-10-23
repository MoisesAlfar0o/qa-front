import { z } from 'zod';

import { validateTargetUrl } from './security.ts';

export type Environment = 'test' | 'staging' | 'production';

export interface Project {
  id: string;
  name: string;
  /** Origin plus optional base path, e.g. http://127.0.0.1:4173 */
  baseUrl: string;
  startPath: string;
  allowedOrigins: string[];
  environment: Environment;
  auth: { mode: 'none' | 'storage-state' };
  createdAt: string;
  updatedAt: string;
}

export const ProjectInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  url: z.string().trim().min(1).max(500),
  environment: z.enum(['test', 'staging', 'production']).default('test'),
  authMode: z.enum(['none', 'storage-state']).default('none'),
});

export type ProjectInput = z.input<typeof ProjectInputSchema>;

/** Splits the URL the user typed into an authorized origin and a start path. */
export function normalizeProjectUrl(rawUrl: string, env: NodeJS.ProcessEnv = process.env): { baseUrl: string; startPath: string; origin: string } {
  const url = validateTargetUrl(rawUrl, env);
  const startPath = `${url.pathname}${url.search}` || '/';
  return { baseUrl: url.origin, startPath: startPath.startsWith('/') ? startPath : `/${startPath}`, origin: url.origin };
}

export function publicProject(project: Project, extra: { authStateAvailable: boolean }) {
  return { ...project, authStateAvailable: extra.authStateAvailable };
}
