import { z } from 'zod';

import { MODEL_ACTION_IDS, type RiskLevel } from './catalog.ts';
import { hashObject } from './hash.ts';

// --- What the model must return (validated, then resolved deterministically) ----------

export const ModelStepSchema = z.object({
  action: z.enum(['unsupported', ...MODEL_ACTION_IDS] as [string, ...string[]]),
  element: z.string().max(24),
  target: z.string().max(200),
  value: z.string().max(300),
  row: z.array(z.object({ column: z.string().max(80), value: z.string().max(200) })).max(3),
});

export const ModelPlanSchema = z.object({
  status: z.enum(['ready', 'needs_clarification', 'unsupported']),
  title: z.string().min(1).max(120),
  objective: z.string().max(300),
  destination: z.array(z.string().max(80)).max(5),
  actions: z.array(ModelStepSchema).max(20),
  assertions: z.array(ModelStepSchema).max(10),
  questions: z.array(z.string().max(300)).max(5),
  missing: z.array(z.string().max(200)).max(5),
});

export type ModelStep = z.infer<typeof ModelStepSchema>;
export type ModelPlan = z.infer<typeof ModelPlanSchema>;

export function modelJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(ModelPlanSchema) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

// --- Internal plan contract --------------------------------------------------------------

export const StoryInputSchema = z.object({
  mode: z.enum(['free', 'structured']),
  text: z.string().max(2000).optional(),
  where: z.string().max(300).optional(),
  what: z.string().max(1000).optional(),
  expect: z.string().max(600).optional(),
  context: z.string().max(600).optional(),
});
export type StoryInput = z.infer<typeof StoryInputSchema>;

export function storyText(input: StoryInput): string {
  if (input.mode === 'free') return (input.text ?? '').trim();
  return [
    input.where && `Dónde: ${input.where.trim()}`,
    input.what && `Qué hacer: ${input.what.trim()}`,
    input.expect && `Qué esperar: ${input.expect.trim()}`,
    input.context && `Contexto y datos: ${input.context.trim()}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export type PlanStatus = 'ready' | 'needs_clarification' | 'unsupported';
export type InfoSource = 'inventory' | 'navigation' | 'user' | 'inferred';

export interface PlanStep {
  action: string;
  params: Record<string, unknown>;
  /** Where the step's target and data come from: observed inventory, user text or inference. */
  source: InfoSource;
  elementId?: string;
  description: string;
  risk: RiskLevel;
}

export interface Plan {
  schemaVersion: 1;
  status: PlanStatus;
  title: string;
  objective: string;
  originalText: string;
  input: StoryInput;
  preconditions: Array<{ id: string; description: string; satisfied: boolean; mechanism: string }>;
  destination: { nodeId: string; path: string[]; route: string | null; source: InfoSource } | null;
  actions: PlanStep[];
  assertions: PlanStep[];
  questions: string[];
  warnings: string[];
  missingCapabilities: string[];
  evidence: Array<{ elementId: string; pageId: string; source: string; observedAt: string }>;
  risk: { level: RiskLevel; reasons: string[]; authorizationRequired: boolean };
  provenance: { provider: string; model: string; attempts: number; generatedAt: string; catalogVersion: string; inventoryExploredAt: string | null };
  canonicalKey: string;
}

/**
 * Semantic identity of a plan: destination, ordered actions with their arguments and
 * assertions. Titles, explanations and provenance are excluded on purpose, so two
 * phrasings that resolve to the same behaviour produce the same key.
 */
export function canonicalKey(plan: Pick<Plan, 'destination' | 'actions' | 'assertions'>): string {
  return hashObject({
    destination: plan.destination?.nodeId ?? null,
    actions: plan.actions.map((step) => ({ action: step.action, params: step.params })),
    assertions: plan.assertions.map((step) => ({ action: step.action, params: step.params })),
  });
}
