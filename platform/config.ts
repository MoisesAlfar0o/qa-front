import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function int(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export interface PlatformConfig {
  workspace: string;
  ollama: { baseUrl: string; model: string; timeoutMs: number; maxAttempts: number; numCtx: number; numPredict: number };
  runs: { maxConcurrent: number; timeoutMs: number; cancelGraceMs: number; retention: number };
  mcp: { enabled: boolean };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): PlatformConfig {
  return {
    workspace: path.resolve(ROOT, env.QA_WORKSPACE ?? 'workspace'),
    ollama: {
      baseUrl: env.OLLAMA_BASE_URL ?? env.OLLAMA_URL ?? 'http://127.0.0.1:11434',
      model: env.OLLAMA_MODEL ?? 'qwen2.5:3b',
      timeoutMs: int(env.OLLAMA_TIMEOUT_MS, 120_000, 5_000, 600_000),
      maxAttempts: int(env.OLLAMA_MAX_ATTEMPTS, 3, 1, 5),
      numCtx: int(env.OLLAMA_NUM_CTX, 8192, 2048, 32768),
      numPredict: int(env.OLLAMA_NUM_PREDICT, 2048, 256, 8192),
    },
    runs: {
      maxConcurrent: int(env.QA_MAX_CONCURRENT_RUNS, 2, 1, 8),
      timeoutMs: int(env.QA_RUN_TIMEOUT_MS, 300_000, 10_000, 3_600_000),
      cancelGraceMs: int(env.QA_CANCEL_GRACE_MS, 15_000, 1_000, 120_000),
      retention: int(env.QA_RUN_RETENTION, 50, 5, 1000),
    },
    mcp: { enabled: env.QA_MCP_ENABLED !== '0' },
  };
}
