import { z } from 'zod';

export const UuidSchema = z.string().uuid();
export type Uuid = z.infer<typeof UuidSchema>;

export const CorrelationIdSchema = z.string().min(1);
export type CorrelationId = z.infer<typeof CorrelationIdSchema>;

export const TimestampSchema = z.coerce.date();
export type Timestamp = z.infer<typeof TimestampSchema>;

export const PaginationSchema = z.object({
  limit: z.number().int().positive().default(50),
  offset: z.number().int().nonnegative().default(0),
});
export type Pagination = z.infer<typeof PaginationSchema>;
