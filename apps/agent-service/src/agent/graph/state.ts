import { z } from 'zod';
import { WorkingMemorySchema } from '@repo/memory-core';

export const ToolOutputSchema = z.object({
  toolName: z.string(),
  input: z.unknown(),
  output: z.unknown(),
  error: z.string().optional(),
});

/**
 * What `distill` extracts and `reflect` writes.
 *
 * It lives in state rather than inside one node because the two halves are
 * separated on purpose: `reflect` must be a function of its input state for a
 * retry to replay identical writes. See `distill.node.ts`.
 */
export const ExtractionSchema = z.object({
  entities: z.array(
    z.object({ id: z.string(), label: z.string(), description: z.string().optional() }),
  ),
  relationships: z.array(
    z.object({
      fromId: z.string(),
      toId: z.string(),
      type: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  facts: z.array(z.object({ text: z.string() })),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

export const AgentStateSchema = WorkingMemorySchema.extend({
  stepCount: z.number().int().nonnegative().default(0),
  maxSteps: z.number().int().positive().default(10),
  // Retrieval knobs from RunRequestConfig. They were validated at the boundary
  // and then dropped: `retrieve` hardcoded topK 10 and hopDepth 2, so a client
  // could set them and nothing downstream read them.
  topK: z.number().int().positive().default(10),
  hopDepth: z.number().int().min(1).max(3).default(2),
  shouldContinue: z.boolean().default(true),
  currentPlan: z.string().optional(),
  toolOutputs: z.array(ToolOutputSchema).default([]),
  extraction: ExtractionSchema.optional(),
});

export type AgentState = z.infer<typeof AgentStateSchema>;
