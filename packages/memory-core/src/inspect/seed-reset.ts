import { z } from 'zod';
import type pg from 'pg';
import type { Driver } from 'neo4j-driver';
import { getTracer } from '@repo/telemetry';

const tracer = getTracer('memory-core');

export const SeedStateSchema = z.object({
  sessionId: z.string().uuid(),
  /** `:Concept` ids the seed owns. Everything else is a trial's leftovers. */
  conceptIds: z.array(z.string()).default([]),
  /** `content_hash` values the seed owns, in pgvector and in the graph. */
  contentHashes: z.array(z.string()).default([]),
});
export type SeedState = z.input<typeof SeedStateSchema>;

/**
 * Restores a session to its seeded state between evaluation trials.
 *
 * Reset is not "empty the database". Postgres and Neo4j carry state across
 * trials and `reflect`'s writes are idempotent by content hash, so trial 2 of
 * a task reads trial 1's writes — but a truncate that also removes the seeds
 * makes every trial after the first a different task. What has to go is
 * exactly what a trial wrote.
 *
 * It is also load-bearing rather than tidy. `episodes` is keyed on
 * `(session_id, turn_index)` and first write wins, so without this the second
 * trial of a task writes no row at all and its `run_id` never appears — an
 * outcome grader keyed on the run would fail every trial after the first, for
 * a reason that has nothing to do with the agent.
 *
 * **The Neo4j half is database-wide.** Neither `:Concept` nor `:Fact` carries a
 * session — `mergeEntity` writes an id, a label and a description, and nothing
 * else — so "everything this session's trials wrote" cannot be expressed in
 * Cypher. What can be expressed is "everything the seed does not own", and that
 * is what runs. Point an evaluation run at a disposable database.
 *
 * The checkpointer's three tables are deliberately untouched: they are outside
 * `runMigrations`, `PostgresSaver.setup()` owns them, and each run mints a
 * fresh `thread_id`, so they accumulate rather than interfere.
 */
export interface SeedReset {
  restoreToSeed(seed: SeedState): Promise<void>;
}

export class PgNeo4jSeedReset implements SeedReset {
  constructor(
    private readonly pool: pg.Pool,
    private readonly driver: Driver,
  ) {}

  async restoreToSeed(seed: SeedState): Promise<void> {
    const validated = SeedStateSchema.parse(seed);

    return tracer.startActiveSpan('memory.inspect.restoreToSeed', async (span) => {
      try {
        span.setAttribute('session_id', validated.sessionId);
        span.setAttribute('seedConceptCount', validated.conceptIds.length);
        span.setAttribute('seedFactCount', validated.contentHashes.length);

        await this.pool.query('DELETE FROM episodes WHERE session_id = $1', [validated.sessionId]);
        await this.pool.query(
          'DELETE FROM semantic_facts WHERE session_id = $1 AND NOT (content_hash = ANY($2))',
          [validated.sessionId, validated.contentHashes],
        );

        const session = this.driver.session();
        try {
          await session.run('MATCH (f:Fact) WHERE NOT f.contentHash IN $keep DETACH DELETE f', {
            keep: validated.contentHashes,
          });
          await session.run('MATCH (c:Concept) WHERE NOT c.id IN $keep DETACH DELETE c', {
            keep: validated.conceptIds,
          });
        } finally {
          await session.close();
        }
      } finally {
        span.end();
      }
    });
  }
}
