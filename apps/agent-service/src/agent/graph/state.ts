import { z } from 'zod';
import { WorkingMemorySchema } from '@repo/memory-core';

export const ToolOutputSchema = z.object({
  toolName: z.string(),
  input: z.unknown(),
  output: z.unknown(),
  error: z.string().optional(),
});

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
});

export type AgentState = z.infer<typeof AgentStateSchema>;
