import type pg from 'pg';
import { getTracer } from '@repo/telemetry';
import { toSql } from 'pgvector';
import type { RetrievalCandidate } from '../retrieval-facade.js';

const tracer = getTracer('memory-core');

export interface PgvectorReader {
  searchByCosine(queryEmbedding: number[], topK: number): Promise<RetrievalCandidate[]>;
}

export class PgPgvectorReader implements PgvectorReader {
  constructor(private readonly pool: pg.Pool) {}

  async searchByCosine(queryEmbedding: number[], topK: number): Promise<RetrievalCandidate[]> {
    return tracer.startActiveSpan('memory.pgvector.search', async (span) => {
      try {
        span.setAttribute('topK', topK);
        span.setAttribute('queryLength', queryEmbedding.length);

        const result = await this.pool.query(
          `SELECT content_hash, text, episode_id,
                  1 - (embedding <=> $1::vector) AS score
           FROM semantic_facts
           ORDER BY embedding <=> $1::vector
           LIMIT $2`,
          [toSql(queryEmbedding), topK],
        );

        const candidates: RetrievalCandidate[] = result.rows.map(
          (row: { content_hash: string; text: string; score: number; episode_id: string }) => ({
            source: 'pgvector' as const,
            score: row.score,
            content: row.text,
            // The query has always selected content_hash; returning it is what
            // lets RRF recognise a fact that both retrievers found.
            contentHash: row.content_hash,
            episodeId: row.episode_id,
          }),
        );

        span.setAttribute('resultCount', candidates.length);
        return candidates;
      } finally {
        span.end();
      }
    });
  }
}
