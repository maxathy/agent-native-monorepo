import type { Driver } from 'neo4j-driver';
import { getTracer } from '@repo/telemetry';
import type { RetrievalCandidate } from '../retrieval-facade.js';

const tracer = getTracer('memory-core');

export interface Neo4jReader {
  expandFromSeeds(seedEntityIds: string[], hopDepth: number): Promise<RetrievalCandidate[]>;
}

export class CypherNeo4jReader implements Neo4jReader {
  constructor(private readonly driver: Driver) {}

  async expandFromSeeds(
    seedEntityIds: string[],
    hopDepth: number,
  ): Promise<RetrievalCandidate[]> {
    return tracer.startActiveSpan('memory.neo4j.expand', async (span) => {
      try {
        span.setAttribute('seedEntityCount', seedEntityIds.length);
        span.setAttribute('hopDepth', hopDepth);

        if (seedEntityIds.length === 0) {
          span.setAttribute('resultCount', 0);
          return [];
        }

        const session = this.driver.session();
        try {
          // Bounded multi-hop traversal from seed entities
          const result = await session.run(
            `MATCH path = (seed:Concept)-[:RELATES_TO*1..${Math.min(hopDepth, 3)}]-(related:Concept)
             WHERE seed.id IN $seedIds AND related.id <> seed.id
             WITH related, min(length(path)) AS distance
             RETURN DISTINCT related.id AS entityId,
                    related.label AS label,
                    related.description AS description,
                    distance,
                    1.0 / (1.0 + distance) AS score
             ORDER BY score DESC
             LIMIT 50`,
            { seedIds: seedEntityIds },
          );

          const candidates: RetrievalCandidate[] = result.records.map((record) => ({
            source: 'neo4j' as const,
            score: record.get('score') as number,
            content: `${record.get('label') as string}: ${(record.get('description') as string) ?? ''}`.trim(),
            entityId: record.get('entityId') as string,
          }));

          span.setAttribute('resultCount', candidates.length);
          return candidates;
        } finally {
          await session.close();
        }
      } finally {
        span.end();
      }
    });
  }
}
