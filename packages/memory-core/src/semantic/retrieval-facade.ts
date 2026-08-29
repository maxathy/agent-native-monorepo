import { z } from 'zod';
import { EMBEDDING_DIMENSIONS } from './embedding.js';
import type { Neo4jReader } from './neo4j/neo4j.reader.js';
import type { PgvectorReader } from './pgvector/pgvector.reader.js';

export const RetrievalQuerySchema = z.object({
  queryEmbedding: z.array(z.number()).length(EMBEDDING_DIMENSIONS),
  seedEntityIds: z.array(z.string()),
  topK: z.number().int().positive().default(10),
  hopDepth: z.number().int().min(1).max(3).default(2),
  sessionId: z.string().uuid().optional(),
});
export type RetrievalQuery = z.infer<typeof RetrievalQuerySchema>;

export const RetrievalCandidateSchema = z.object({
  source: z.enum(['neo4j', 'pgvector']),
  score: z.number(),
  content: z.string(),
  /** sha256 of `content`. The fusion key — see `rrfMerge`. */
  contentHash: z.string().optional(),
  entityId: z.string().optional(),
  episodeId: z.string().uuid().optional(),
});
export type RetrievalCandidate = z.infer<typeof RetrievalCandidateSchema>;

export interface RetrievalFacade {
  retrieve(query: RetrievalQuery): Promise<RetrievalCandidate[]>;
}

/**
 * Reciprocal Rank Fusion constant. Higher values produce more uniform
 * blending between result sources; 60 is the standard default from
 * the original RRF paper (Cormack et al., 2009).
 */
const RRF_K = 60;

/**
 * Merges two ranked lists using Reciprocal Rank Fusion.
 *
 * For each candidate, the RRF score is: 1 / (k + rank)
 * where rank is 1-indexed. Candidates appearing in both lists
 * receive the sum of their RRF scores from each list.
 *
 * The key is `contentHash`, falling back to `content`. It used to be
 * `entityId ?? content`, and Neo4j candidates always carried an `entityId`
 * while pgvector candidates never did, so the two lists keyed differently and
 * no score was ever summed. Fixing the key alone would not have helped: the
 * graph returned `:Concept` nodes and pgvector returned facts, and two lists
 * drawn from disjoint universes cannot intersect under any key. Both readers
 * now return facts. The fallback is exact rather than defensive — a fact's
 * hash is sha256 of the same text `content` carries, so both spellings of the
 * key identify a fact identically.
 */
export function rrfMerge(lists: RetrievalCandidate[][], topK: number): RetrievalCandidate[] {
  const scoreMap = new Map<string, { candidate: RetrievalCandidate; rrfScore: number }>();

  for (const list of lists) {
    for (let rank = 0; rank < list.length; rank++) {
      const candidate = list[rank]!;
      const key = candidate.contentHash ?? candidate.content;
      const rrfScore = 1 / (RRF_K + rank + 1);

      const existing = scoreMap.get(key);
      if (existing) {
        existing.rrfScore += rrfScore;
      } else {
        scoreMap.set(key, { candidate, rrfScore });
      }
    }
  }

  return Array.from(scoreMap.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, topK)
    .map(({ candidate, rrfScore }) => ({
      ...candidate,
      score: rrfScore,
    }));
}

export class HybridRetrievalFacade implements RetrievalFacade {
  constructor(
    private readonly pgvectorReader: PgvectorReader,
    private readonly neo4jReader: Neo4jReader,
  ) {}

  async retrieve(query: RetrievalQuery): Promise<RetrievalCandidate[]> {
    const validated = RetrievalQuerySchema.parse(query);

    // Run both retrievals in parallel
    const [pgvectorResults, neo4jResults] = await Promise.all([
      this.pgvectorReader.searchByCosine(validated.queryEmbedding, validated.topK * 2),
      this.neo4jReader.expandFromSeeds(validated.seedEntityIds, validated.hopDepth),
    ]);

    // Merge via Reciprocal Rank Fusion
    return rrfMerge([pgvectorResults, neo4jResults], validated.topK);
  }
}
