import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { episodes } from './schema.js';

export const EpisodeFindInputSchema = z.object({
  sessionId: z.string().uuid(),
  limit: z.number().int().positive().default(50),
});
export type EpisodeFindInput = z.infer<typeof EpisodeFindInputSchema>;

export const EpisodeWriteInputSchema = z.object({
  sessionId: z.string().uuid(),
  runId: z.string().uuid(),
  turnIndex: z.number().int().nonnegative(),
  role: z.enum(['user', 'assistant', 'tool']),
  content: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});
export type EpisodeWriteInput = z.infer<typeof EpisodeWriteInputSchema>;

export interface EpisodicRepository {
  write(input: EpisodeWriteInput): Promise<{ id: string }>;
  findBySession(input: EpisodeFindInput): Promise<Array<EpisodeWriteInput & { id: string; createdAt: Date }>>;
}

export class DrizzleEpisodicRepository implements EpisodicRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async write(input: EpisodeWriteInput): Promise<{ id: string }> {
    const validated = EpisodeWriteInputSchema.parse(input);
    const [row] = await this.db
      .insert(episodes)
      .values({
        sessionId: validated.sessionId,
        runId: validated.runId,
        turnIndex: validated.turnIndex,
        role: validated.role,
        content: validated.content,
        metadata: validated.metadata ?? null,
      })
      .returning({ id: episodes.id });

    return { id: row!.id };
  }

  async findBySession(input: EpisodeFindInput): Promise<Array<EpisodeWriteInput & { id: string; createdAt: Date }>> {
    const validated = EpisodeFindInputSchema.parse(input);
    const rows = await this.db
      .select()
      .from(episodes)
      .where(eq(episodes.sessionId, validated.sessionId))
      .orderBy(desc(episodes.createdAt))
      .limit(validated.limit);

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      runId: row.runId,
      turnIndex: row.turnIndex,
      role: row.role as 'user' | 'assistant' | 'tool',
      content: row.content,
      metadata: row.metadata as Record<string, unknown> | undefined,
      createdAt: row.createdAt,
    }));
  }
}
