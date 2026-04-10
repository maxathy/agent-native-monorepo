import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import neo4j, { type Driver } from 'neo4j-driver';
import pg from 'pg';
import { CypherNeo4jWriter } from '../src/semantic/neo4j/neo4j.writer.js';
import { PgPgvectorWriter } from '../src/semantic/pgvector/pgvector.writer.js';

const DATABASE_URL = process.env['DATABASE_URL'];
const NEO4J_URI = process.env['NEO4J_URI'];
const NEO4J_USER = process.env['NEO4J_USER'] ?? 'neo4j';
const NEO4J_PASSWORD = process.env['NEO4J_PASSWORD'] ?? 'password';

describe.skipIf(!DATABASE_URL || !NEO4J_URI)('Semantic Memory (integration)', () => {
  let neo4jDriver: Driver;
  let pgPool: pg.Pool;
  let neo4jWriter: CypherNeo4jWriter;
  let pgWriter: PgPgvectorWriter;

  beforeAll(async () => {
    neo4jDriver = neo4j.driver(NEO4J_URI!, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
    pgPool = new pg.Pool({ connectionString: DATABASE_URL });

    // Ensure pgvector extension and table
    await pgPool.query('CREATE EXTENSION IF NOT EXISTS vector');
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS semantic_facts (
        content_hash TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        embedding vector(1536) NOT NULL,
        episode_id UUID NOT NULL,
        session_id UUID NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Clear test data
    const session = neo4jDriver.session();
    try {
      await session.run('MATCH (n) DETACH DELETE n');
    } finally {
      await session.close();
    }
    await pgPool.query('DELETE FROM semantic_facts');

    neo4jWriter = new CypherNeo4jWriter(neo4jDriver);
    pgWriter = new PgPgvectorWriter(pgPool);
  });

  afterAll(async () => {
    await neo4jDriver.close();
    await pgPool.end();
  });

  describe('Neo4jWriter idempotency', () => {
    it('merges an entity without creating duplicates', async () => {
      const entity = { id: 'concept-a', label: 'Concept A', description: 'A test concept.' };

      await neo4jWriter.mergeEntity(entity);
      await neo4jWriter.mergeEntity(entity);

      const session = neo4jDriver.session();
      try {
        const result = await session.run('MATCH (c:Concept {id: $id}) RETURN count(c) AS cnt', {
          id: 'concept-a',
        });
        const count = result.records[0]!.get('cnt').toNumber();
        expect(count).toBe(1);
      } finally {
        await session.close();
      }
    });

    it('merges a relationship without creating duplicates', async () => {
      await neo4jWriter.mergeEntity({ id: 'concept-a', label: 'Concept A' });
      await neo4jWriter.mergeEntity({ id: 'concept-b', label: 'Concept B' });

      const rel = {
        fromId: 'concept-a',
        toId: 'concept-b',
        type: 'SUPPORTS',
        confidence: 0.85,
        episodeId: '550e8400-e29b-41d4-a716-446655440000',
      };

      await neo4jWriter.mergeRelationship(rel);
      await neo4jWriter.mergeRelationship(rel);

      const session = neo4jDriver.session();
      try {
        const result = await session.run(
          `MATCH (:Concept {id: 'concept-a'})-[r:RELATES_TO]->(:Concept {id: 'concept-b'})
           RETURN count(r) AS cnt`,
        );
        const count = result.records[0]!.get('cnt').toNumber();
        expect(count).toBe(1);
      } finally {
        await session.close();
      }
    });
  });

  describe('PgvectorWriter idempotency', () => {
    it('upserts a fact without creating duplicates', async () => {
      const embedding = new Array(1536).fill(0).map((_, i) => Math.sin(i * 0.01));
      const fact = {
        contentHash: 'sha256-test-fact-1',
        text: 'LangGraph enables stateful agent workflows.',
        embedding,
        episodeId: '550e8400-e29b-41d4-a716-446655440000',
        sessionId: '550e8400-e29b-41d4-a716-446655440001',
      };

      await pgWriter.upsertFact(fact);
      await pgWriter.upsertFact(fact);

      const result = await pgPool.query(
        'SELECT count(*) AS cnt FROM semantic_facts WHERE content_hash = $1',
        ['sha256-test-fact-1'],
      );
      expect(parseInt(result.rows[0].cnt, 10)).toBe(1);
    });
  });
});
