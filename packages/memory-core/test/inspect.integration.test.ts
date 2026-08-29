import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import pg from 'pg';
import neo4j, { type Driver } from 'neo4j-driver';
import { PgNeo4jMemoryInspector } from '../src/inspect/run-inspector.js';
import { PgNeo4jSeedReset } from '../src/inspect/seed-reset.js';
import { DrizzleEpisodicRepository } from '../src/episodic/episodic.repo.js';
import { CypherNeo4jWriter } from '../src/semantic/neo4j/neo4j.writer.js';
import { PgPgvectorWriter } from '../src/semantic/pgvector/pgvector.writer.js';
import { EMBEDDING_DIMENSIONS, l2Normalize } from '../src/semantic/embedding.js';
import { runMigrations } from '../src/migrate.js';
import { skipUnlessIntegrationEnv } from './integration-env.js';
import { drizzle } from 'drizzle-orm/node-postgres';

const DATABASE_URL = process.env['DATABASE_URL'];
const NEO4J_URI = process.env['NEO4J_URI'];
const NEO4J_USER = process.env['NEO4J_USER'] ?? 'neo4j';
const NEO4J_PASSWORD = process.env['NEO4J_PASSWORD'] ?? 'password';

const SKIP = skipUnlessIntegrationEnv(
  'memory inspection (integration)',
  'DATABASE_URL',
  'NEO4J_URI',
);

const SESSION = '550e8400-e29b-41d4-a716-4466554400a0';
const SEED_EPISODE = '550e8400-e29b-41d4-a716-4466554400a1';
const RUN = '550e8400-e29b-41d4-a716-4466554400a2';
const SECOND_RUN = '550e8400-e29b-41d4-a716-4466554400a3';

const SEED_CONCEPTS = ['inspect-seed-concept'];
const SEED_HASHES = ['inspect-seed-fact'];

const embedding = () => l2Normalize(new Array(EMBEDDING_DIMENSIONS).fill(0).map((_, i) => i + 1));

describe.skipIf(SKIP)('memory inspection (integration)', () => {
  let pool: pg.Pool;
  let driver: Driver;
  let inspector: PgNeo4jMemoryInspector;
  let reset: PgNeo4jSeedReset;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    driver = neo4j.driver(NEO4J_URI!, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
    await runMigrations(pool);
    inspector = new PgNeo4jMemoryInspector(pool, driver);
    reset = new PgNeo4jSeedReset(pool, driver);
  });

  afterAll(async () => {
    await driver.close();
    await pool.end();
  });

  /** Re-lays the seed, then removes everything a previous trial left behind. */
  async function seedAndReset(): Promise<void> {
    const writer = new CypherNeo4jWriter(driver);
    await writer.mergeEntity({ id: SEED_CONCEPTS[0]!, label: 'Seed Concept' });
    await new PgPgvectorWriter(pool).upsertFact({
      contentHash: SEED_HASHES[0]!,
      text: 'A seeded fact.',
      embedding: embedding(),
      episodeId: SEED_EPISODE,
      sessionId: SESSION,
    });
    await reset.restoreToSeed({
      sessionId: SESSION,
      conceptIds: SEED_CONCEPTS,
      contentHashes: SEED_HASHES,
    });
  }

  async function writeAsRun(runId: string): Promise<void> {
    const repo = new DrizzleEpisodicRepository(drizzle(pool));
    await repo.write({
      sessionId: SESSION,
      runId,
      turnIndex: 0,
      role: 'user',
      content: 'What is LangGraph?',
    });
    await new CypherNeo4jWriter(driver).mergeEntity({ id: 'langgraph', label: 'LangGraph' });
    await new PgPgvectorWriter(pool).upsertFact({
      contentHash: `hash-${runId}`,
      text: `A fact written by ${runId}.`,
      embedding: embedding(),
      episodeId: runId,
      sessionId: SESSION,
    });
    await new CypherNeo4jWriter(driver).mergeFact({
      contentHash: `hash-${runId}`,
      text: `A fact written by ${runId}.`,
      episodeId: runId,
      entityIds: ['langgraph'],
    });
  }

  beforeEach(async () => {
    await seedAndReset();
  });

  it('counts what one run wrote, scoped to that run', async () => {
    await writeAsRun(RUN);

    const inspection = await inspector.inspectRun({ runId: RUN, conceptIds: ['langgraph'] });

    expect(inspection.episodeRowsForRun).toBe(1);
    expect(inspection.factRowsForRun).toBe(1);
    expect(inspection.factNodesForRun).toBe(1);
    expect(inspection.presentConceptIds).toEqual(['langgraph']);
  });

  it('reports a concept the run never merged as absent', async () => {
    await writeAsRun(RUN);

    const inspection = await inspector.inspectRun({
      runId: RUN,
      conceptIds: ['langgraph', 'never-extracted'],
    });

    expect(inspection.presentConceptIds).toEqual(['langgraph']);
  });

  it('restores the seed and removes what a trial wrote', async () => {
    await writeAsRun(RUN);
    await reset.restoreToSeed({
      sessionId: SESSION,
      conceptIds: SEED_CONCEPTS,
      contentHashes: SEED_HASHES,
    });

    const after = await inspector.inspectRun({ runId: RUN, conceptIds: ['langgraph'] });
    expect(after.episodeRowsForRun).toBe(0);
    expect(after.factRowsForRun).toBe(0);
    expect(after.factNodesForRun).toBe(0);
    expect(after.presentConceptIds).toEqual([]);

    // The seed itself survives. A reset that took it too would make every trial
    // after the first a different task.
    const seedRows = await pool.query('SELECT 1 FROM semantic_facts WHERE content_hash = $1', [
      SEED_HASHES[0],
    ]);
    expect(seedRows.rowCount).toBe(1);

    const seedConcept = await inspector.inspectRun({ runId: RUN, conceptIds: SEED_CONCEPTS });
    expect(seedConcept.presentConceptIds).toEqual(SEED_CONCEPTS);
  });

  it('lets a second trial write its own episodic row under its own run id', async () => {
    // Without the reset this is the failure that matters: `episodes` is keyed
    // on (session_id, turn_index) and first write wins, so trial 2 writes
    // nothing and its run id appears nowhere.
    await writeAsRun(RUN);
    await reset.restoreToSeed({
      sessionId: SESSION,
      conceptIds: SEED_CONCEPTS,
      contentHashes: SEED_HASHES,
    });
    await writeAsRun(SECOND_RUN);

    expect(
      (await inspector.inspectRun({ runId: SECOND_RUN, conceptIds: [] })).episodeRowsForRun,
    ).toBe(1);
    expect((await inspector.inspectRun({ runId: RUN, conceptIds: [] })).episodeRowsForRun).toBe(0);
  });
});
