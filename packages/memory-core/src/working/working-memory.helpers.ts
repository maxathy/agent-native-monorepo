import { z } from 'zod';
import {
  MessageSchema,
  RetrievedContextItemSchema,
  TokenCountsSchema,
  OutcomeSchema,
} from '@repo/shared-types';

export const WorkingMemorySchema = z.object({
  runId: z.string().uuid(),
  sessionId: z.string().uuid(),
  correlationId: z.string(),
  messages: z.array(MessageSchema),
  retrievedContext: z.array(RetrievedContextItemSchema),
  plan: z.string().optional(),
  toolOutputs: z.array(z.unknown()),
  tokenCounts: TokenCountsSchema,
  outcome: OutcomeSchema.optional(),
});

export type WorkingMemory = z.infer<typeof WorkingMemorySchema>;

export function seedWorkingMemory(
  input: Pick<WorkingMemory, 'runId' | 'sessionId' | 'correlationId' | 'messages'>,
): WorkingMemory {
  return WorkingMemorySchema.parse({
    ...input,
    retrievedContext: [],
    toolOutputs: [],
    tokenCounts: { prompt: 0, completion: 0 },
  });
}

export function mergeRetrievedContext(
  state: WorkingMemory,
  candidates: WorkingMemory['retrievedContext'],
): WorkingMemory {
  return { ...state, retrievedContext: candidates };
}

export function appendToolOutput(
  state: WorkingMemory,
  output: unknown,
): WorkingMemory {
  return { ...state, toolOutputs: [...state.toolOutputs, output] };
}

export function addTokenCounts(
  state: WorkingMemory,
  delta: { prompt: number; completion: number },
): WorkingMemory {
  return {
    ...state,
    tokenCounts: {
      prompt: state.tokenCounts.prompt + delta.prompt,
      completion: state.tokenCounts.completion + delta.completion,
    },
  };
}
