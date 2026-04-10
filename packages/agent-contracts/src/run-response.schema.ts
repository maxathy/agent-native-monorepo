import { z } from 'zod';
import {
  UuidSchema,
  MessageSchema,
  RetrievedContextItemSchema,
  TokenCountsSchema,
  OutcomeSchema,
} from '@repo/shared-types';

export const RunResponseSchema = z.object({
  runId: UuidSchema,
  sessionId: UuidSchema,
  messages: z.array(MessageSchema),
  outcome: OutcomeSchema,
  tokenCounts: TokenCountsSchema,
  retrievedContext: z.array(RetrievedContextItemSchema),
});
export type RunResponse = z.infer<typeof RunResponseSchema>;

export const StreamEventSchema = z.object({
  node: z.string(),
  delta: z.string().optional(),
  state: z
    .object({
      runId: UuidSchema.optional(),
      sessionId: UuidSchema.optional(),
      outcome: OutcomeSchema.optional(),
      tokenCounts: TokenCountsSchema.optional(),
    })
    .optional(),
});
export type StreamEvent = z.infer<typeof StreamEventSchema>;
