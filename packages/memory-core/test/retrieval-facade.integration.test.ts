import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import neo4j, { type Driver } from 'neo4j-driver';
import pg from 'pg';
import { CypherNeo4jWriter } from '../src/semantic/neo4j/neo4j.writer.js';
import { CypherNeo4jReader } from '../src/semantic/neo4j/neo4j.reader.js';
import { PgPgvectorWriter } from '../src/semantic/pgvector/pgvector.writer.js';
import { PgPgvectorReader } from '../src/semantic/pgvector/pgvector.reader.js';
import { HybridRetrievalFacade } from '../src/semantic/retrieval-facade.js';
import { EMBEDDING_DIMENSIONS } from '../src/semantic/embedding.js';
import { runMigrations } from '../src/migrate.js';
import { skipUnlessIntegrationEnv } from './integration-env.js';

const DATABASE_URL = process.env['DATABASE_URL'];
const NEO4J_URI = process.env['NEO4J_URI'];
const NEO4J_USER = process.env['NEO4J_USER'] ?? 'neo4j';
const NEO4J_PASSWORD = process.env['NEO4J_PASSWORD'] ?? 'password';

const SKIP = skipUnlessIntegrationEnv(
  'HybridRetrievalFacade (integration)',
  'DATABASE_URL',
  'NEO4J_URI',
);

describe.skipIf(SKIP)('HybridRetrievalFacade (integration)', () => {
  let neo4jDriver: Driver;
  let pgPool: pg.Pool;
  let facade: HybridRetrievalFacade;
  let neo4jReader: CypherNeo4jReader;
  let pgReader: PgPgvectorReader;

  beforeAll(async () => {
    neo4jDriver = neo4j.driver(NEO4J_URI!, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
    pgPool = new pg.Pool({ connectionString: DATABASE_URL });

    await runMigrations(pgPool);

    // Clear prior test data
    const session = neo4jDriver.session();
    try {
      await session.run('MATCH (n) DETACH DELETE n');
    } finally {
      await session.close();
    }
    await pgPool.query('DELETE FROM semantic_facts');

    // Seed Neo4j with test entities and relationships
    const neo4jWriter = new CypherNeo4jWriter(neo4jDriver);
    await neo4jWriter.mergeEntity({
      id: 'langgraph',
      label: 'LangGraph',
      description: 'Framework for stateful agents.',
    });
    await neo4jWriter.mergeEntity({
      id: 'memory',
      label: 'Memory',
      description: 'Agent memory system.',
    });
    await neo4jWriter.mergeEntity({
      id: 'neo4j-concept',
      label: 'Neo4j',
      description: 'Graph database.',
    });
    await neo4jWriter.mergeRelationship({
      fromId: 'langgraph',
      toId: 'memory',
      type: 'USES',
      confidence: 0.95,
      episodeId: '550e8400-e29b-41d4-a716-446655440000',
    });
    await neo4jWriter.mergeRelationship({
      fromId: 'memory',
      toId: 'neo4j-concept',
      type: 'STORED_IN',
      confidence: 0.9,
      episodeId: '550e8400-e29b-41d4-a716-446655440000',
    });

    // Seed pgvector with test embeddings
    const pgWriter = new PgPgvectorWriter(pgPool);
    const makeEmbedding = (seed: number) =>
      new Array(EMBEDDING_DIMENSIONS).fill(0).map((_, i) => Math.sin((i + seed) * 0.01));

    await pgWriter.upsertFact({
      contentHash: 'sha256-facade-test-1',
      text: 'LangGraph enables stateful agent workflows with memory.',
      embedding: makeEmbedding(1),
      episodeId: '550e8400-e29b-41d4-a716-446655440000',
      sessionId: '550e8400-e29b-41d4-a716-446655440001',
    });
    await pgWriter.upsertFact({
      contentHash: 'sha256-facade-test-2',
      text: 'Semantic memory combines Neo4j and pgvector.',
      embedding: makeEmbedding(2),
      episodeId: '550e8400-e29b-41d4-a716-446655440000',
      sessionId: '550e8400-e29b-41d4-a716-446655440001',
    });

    // Seed the same facts into Neo4j, keyed on the hashes pgvector used. This
    // is what gives the two retrievers one candidate universe: the graph
    // traversal reaches a :Fact, not a :Concept, so a fact both paths find is
    // one candidate and RRF sums its ranks.
    await neo4jWriter.mergeFact({
      contentHash: 'sha256-facade-test-1',
      text: 'LangGraph enables stateful agent workflows with memory.',
      episodeId: '550e8400-e29b-41d4-a716-446655440000',
      entityIds: ['langgraph'],
    });
    await neo4jWriter.mergeFact({
      contentHash: 'sha256-facade-graph-only',
      text: 'Graph traversal reaches facts no vector search returned.',
      episodeId: '550e8400-e29b-41d4-a716-446655440000',
      entityIds: ['memory'],
    });

    // Build the facade
    neo4jReader = new CypherNeo4jReader(neo4jDriver);
    pgReader = new PgPgvectorReader(pgPool);
    facade = new HybridRetrievalFacade(pgReader, neo4jReader);
  });

  afterAll(async () => {
    await neo4jDriver.close();
    await pgPool.end();
  });

  it('returns candidates from both Neo4j and pgvector', async () => {
    const queryEmbedding = new Array(EMBEDDING_DIMENSIONS).fill(0).map((_, i) => Math.sin((i + 1) * 0.01));

    const results = await facade.retrieve({
      queryEmbedding,
      seedEntityIds: ['langgraph'],
      topK: 10,
      hopDepth: 2,
    });

    expect(results.length).toBeGreaterThan(0);

    const sources = new Set(results.map((r) => r.source));
    // Both sources should contribute candidates
    expect(sources.has('pgvector')).toBe(true);
    expect(sources.has('neo4j')).toBe(true);
  });

  it('sums the reciprocal ranks of a fact both retrievers found', async () => {
    const queryEmbedding = new Array(EMBEDDING_DIMENSIONS)
      .fill(0)
      .map((_, i) => Math.sin((i + 1) * 0.01));
    const fused = 'sha256-facade-test-1';

    // Take the ranks from the readers themselves rather than hardcoding them,
    // so the assertion is about fusion and not about seed ordering.
    const [pgList, neoList] = await Promise.all([
      pgReader.searchByCosine(queryEmbedding, 20),
      neo4jReader.expandFromSeeds(['langgraph'], 2),
    ]);
    const pgRank = pgList.findIndex((c) => c.contentHash === fused);
    const neoRank = neoList.findIndex((c) => c.contentHash === fused);

    expect(pgRank).toBeGreaterThanOrEqual(0);
    expect(neoRank).toBeGreaterThanOrEqual(0);

    const results = await facade.retrieve({
      queryEmbedding,
      seedEntityIds: ['langgraph'],
      topK: 10,
      hopDepth: 2,
    });

    const matches = results.filter((r) => r.contentHash === fused);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.score).toBeCloseTo(1 / (60 + pgRank + 1) + 1 / (60 + neoRank + 1), 12);
  });

  it('returns RRF scores in monotonically decreasing order', async () => {
    const queryEmbedding = new Array(EMBEDDING_DIMENSIONS).fill(0).map((_, i) => Math.sin((i + 1) * 0.01));

    const results = await facade.retrieve({
      queryEmbedding,
      seedEntityIds: ['langgraph'],
      topK: 10,
      hopDepth: 2,
    });

    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.score).toBeLessThanOrEqual(results[i - 1]!.score);
    }
  });
});
