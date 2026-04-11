#!/usr/bin/env node

/**
 * Seed eval fixtures into Postgres (pgvector) and Neo4j for the
 * agent-eval nightly regression suite.
 *
 * Reads JSON fixture files from apps/agent-service/test/fixtures/
 * and populates the databases with the expected seed data.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import neo4j from 'neo4j-driver';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', 'apps', 'agent-service', 'test', 'fixtures');

const DATABASE_URL = process.env.DATABASE_URL;
const NEO4J_URI = process.env.NEO4J_URI;
const NEO4J_USER = process.env.NEO4J_USER ?? 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD ?? 'password';

if (!DATABASE_URL || !NEO4J_URI) {
  console.error('DATABASE_URL and NEO4J_URI must be set');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));

try {
  // Ensure pgvector extension and table
  await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS semantic_facts (
      content_hash TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      embedding vector(768) NOT NULL,
      episode_id UUID NOT NULL,
      session_id UUID NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const fixtures = readdirSync(fixturesDir).filter((f) => f.endsWith('.json'));

  for (const file of fixtures) {
    const fixture = JSON.parse(readFileSync(join(fixturesDir, file), 'utf-8'));
    const seeds = fixture.expectedSeeds;

    if (!seeds) continue;

    // Seed Neo4j entities
    if (seeds.neo4j) {
      const session = driver.session();
      try {
        for (const entity of seeds.neo4j) {
          await session.run(
            `MERGE (c:Concept {id: $id})
             ON CREATE SET c.label = $label, c.description = $description
             ON MATCH SET c.label = $label, c.description = $description`,
            entity,
          );
        }

        // Seed relationships
        if (seeds.relationships) {
          for (const rel of seeds.relationships) {
            await session.run(
              `MERGE (a:Concept {id: $fromId})
               MERGE (b:Concept {id: $toId})
               MERGE (a)-[r:RELATES_TO {type: $type}]->(b)
               ON CREATE SET r.confidence = $confidence, r.episodeId = $episodeId`,
              rel,
            );
          }
        }
      } finally {
        await session.close();
      }
    }

    // Seed pgvector facts
    if (seeds.pgvector) {
      for (const fact of seeds.pgvector) {
        const embedding = new Array(768).fill(0).map((_, i) => Math.sin(i * 0.01));
        const embeddingStr = `[${embedding.join(',')}]`;

        await pool.query(
          `INSERT INTO semantic_facts (content_hash, text, embedding, episode_id, session_id)
           VALUES ($1, $2, $3::vector, $4, $5)
           ON CONFLICT (content_hash) DO NOTHING`,
          [fact.contentHash, fact.text, embeddingStr, fact.episodeId, fact.sessionId],
        );
      }
    }

    console.log(`Seeded fixture: ${file}`);
  }

  console.log('All fixtures seeded successfully.');
} finally {
  await driver.close();
  await pool.end();
}
