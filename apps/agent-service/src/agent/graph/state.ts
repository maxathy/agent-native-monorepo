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
  shouldContinue: z.boolean().default(true),
  plan: z.string().optional(),
  toolOutputs: z.array(ToolOutputSchema).default([]),
});

export type AgentState = z.infer<typeof AgentStateSchema>;
