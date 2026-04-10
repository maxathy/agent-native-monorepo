import { z } from 'zod';

export const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'tool']),
  content: z.string(),
});
export type Message = z.infer<typeof MessageSchema>;

export const RetrievedContextItemSchema = z.object({
  source: z.enum(['neo4j', 'pgvector']),
  score: z.number(),
  content: z.string(),
  entityId: z.string().optional(),
  episodeId: z.string().uuid().optional(),
});
export type RetrievedContextItem = z.infer<typeof RetrievedContextItemSchema>;

export const TokenCountsSchema = z.object({
  prompt: z.number().int().nonnegative(),
  completion: z.number().int().nonnegative(),
});
export type TokenCounts = z.infer<typeof TokenCountsSchema>;

export const OutcomeSchema = z.enum(['success', 'error', 'partial']);
export type Outcome = z.infer<typeof OutcomeSchema>;
