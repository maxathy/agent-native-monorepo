import { z } from 'zod';
import { UuidSchema, MessageSchema } from '@repo/shared-types';

export const RunRequestConfigSchema = z.object({
  maxSteps: z.number().int().positive().default(10),
  hopDepth: z.number().int().min(1).max(3).default(2),
  topK: z.number().int().positive().default(10),
});
export type RunRequestConfig = z.infer<typeof RunRequestConfigSchema>;

export const RunRequestSchema = z.object({
  sessionId: UuidSchema,
  messages: z.array(MessageSchema).min(1),
  config: RunRequestConfigSchema.optional(),
});
export type RunRequest = z.infer<typeof RunRequestSchema>;
