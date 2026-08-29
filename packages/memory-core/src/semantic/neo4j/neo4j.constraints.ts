import type { Driver } from 'neo4j-driver';
import { createLogger } from '@repo/telemetry';

const logger = createLogger('memory-core');

/**
 * Uniqueness constraints for the knowledge graph, applied at boot.
 *
 * `MERGE` is not safe under concurrency without them: two transactions can
 * each fail to find the node and each create it, which is precisely the
 * duplicate the writer's idempotency is supposed to rule out. The constraint
 * is what makes `MERGE` an upsert rather than a race.
 *
 * Idempotent — `IF NOT EXISTS` on both, so this runs on every boot.
 */
const CONSTRAINTS = [
  'CREATE CONSTRAINT concept_id IF NOT EXISTS FOR (c:Concept) REQUIRE c.id IS UNIQUE',
  'CREATE CONSTRAINT fact_hash IF NOT EXISTS FOR (f:Fact) REQUIRE f.contentHash IS UNIQUE',
] as const;

export async function ensureSemanticConstraints(driver: Driver): Promise<void> {
  const session = driver.session();
  try {
    for (const statement of CONSTRAINTS) {
      await session.run(statement);
    }
    logger.info({ msg: 'neo4j.constraints.ready', count: CONSTRAINTS.length });
  } finally {
    await session.close();
  }
}
