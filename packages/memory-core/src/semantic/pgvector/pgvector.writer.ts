import { z } from 'zod';
import type pg from 'pg';
import { getTracer } from '@repo/telemetry';
import { toSql } from 'pgvector';

const tracer = getTracer('memory-core');

export const FactUpsertSchema = z.object({
  contentHash: z.string(),
  text: z.string(),
  embedding: z.array(z.number()).length(768),
  episodeId: z.string().uuid(),
  sessionId: z.string().uuid(),
});

export interface PgvectorWriter {
  upsertFact(fact: z.infer<typeof FactUpsertSchema>): Promise<void>;
  ensureTable(): Promise<void>;
}

export class PgPgvectorWriter implements PgvectorWriter {
  constructor(private readonly pool: pg.Pool) {}

  async ensureTable(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS semantic_facts (
        content_hash TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        embedding vector(768) NOT NULL,
        episode_id UUID NOT NULL,
        session_id UUID NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  }

  async upsertFact(fact: z.infer<typeof FactUpsertSchema>): Promise<void> {
    const validated = FactUpsertSchema.parse(fact);

    return tracer.startActiveSpan('memory.pgvector.upsert', async (span) => {
      try {
        span.setAttribute('fact.contentHash', validated.contentHash);

        await this.pool.query(
          `INSERT INTO semantic_facts (content_hash, text, embedding, episode_id, session_id)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (content_hash) DO UPDATE SET text = EXCLUDED.text`,
          [
            validated.contentHash,
            validated.text,
            toSql(validated.embedding),
            validated.episodeId,
            validated.sessionId,
          ],
        );
      } finally {
        span.end();
      }
    });
  }
}
