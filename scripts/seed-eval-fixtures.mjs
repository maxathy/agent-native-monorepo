#!/usr/bin/env node

/**
 * Seed eval fixtures into Postgres (pgvector) and Neo4j for the
 * agent-eval nightly regression suite.
 *
 * Reads the task files from `packages/eval-harness/datasets/` and populates the
 * databases with the seed state each one declares.
 *
 * The directory is imported rather than spelled out. It used to be a path
 * literal pointing into `apps/agent-service/test/fixtures`, and the trap that
 * comes with that is one-way: move the task file and leave the literal behind
 * and this script finds nothing, seeds nothing, and reports success — the
 * nightly workflow's seed step stays green over an empty database.
 *
 * Every write goes through a `@repo/memory-core` adapter. This script used to
 * hand-roll the Cypher and the INSERT, and its own comment recorded what that
 * cost: seeding against a hand-rolled copy of the schema is how the eval
 * fixtures ended up in a table shaped differently from production's. The rule
 * that forbids it — no database calls outside `memory-core` — is reviewer
 * checklist rule 4, and this script was the last exception to it.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import neo4j from 'neo4j-driver';
import { EVAL_DATASETS_DIR, fixtureEmbedding } from '@repo/eval-harness';
import { PgNeo4jMemoryInspector, PgNeo4jSeedManager, runMigrations } from '@repo/memory-core';

/** Every dataset directory under `packages/eval-harness/datasets/`. */
const datasetDirs = readdirSync(EVAL_DATASETS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(EVAL_DATASETS_DIR, entry.name));

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
  // The migration owns the schema. Seeding against a hand-rolled copy is how
  // the eval fixtures ended up in a table shaped differently from production's.
  await runMigrations(pool);

  const seeds = new PgNeo4jSeedManager(pool, driver);
  const inspector = new PgNeo4jMemoryInspector(pool, driver);

  const fixtures = datasetDirs.flatMap((dir) =>
    readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => join(dir, f)),
  );

  if (fixtures.length === 0) {
    throw new Error(`no task files found under ${EVAL_DATASETS_DIR}`);
  }

  for (const file of fixtures) {
    const fixture = JSON.parse(readFileSync(file, 'utf-8'));
    const expected = fixture.expectedSeeds;

    if (!expected) continue;

    await seeds.applySeed({
      concepts: expected.neo4j ?? [],
      relationships: expected.relationships ?? [],
      facts: (expected.pgvector ?? []).map((fact) => ({
        ...fact,
        embedding: fixtureEmbedding(),
      })),
    });

    // Reported as a row count, not as an exit code. The failure this replaces
    // is silent and specific: point the loop at a directory with no fixtures in
    // it and the old script found nothing, seeded nothing, and printed
    // "All fixtures seeded successfully" over an empty database.
    const conceptIds = (expected.neo4j ?? []).map((entity) => entity.id);
    const episodeIds = [...new Set((expected.pgvector ?? []).map((fact) => fact.episodeId))];

    let facts = 0;
    let concepts = [];
    for (const episodeId of episodeIds.length > 0 ? episodeIds : [null]) {
      const inspection = await inspector.inspectRun({
        runId: episodeId ?? '00000000-0000-0000-0000-000000000000',
        conceptIds,
      });
      facts += inspection.factRowsForRun;
      concepts = inspection.presentConceptIds;
    }

    const missing = conceptIds.filter((id) => !concepts.includes(id));
    if (missing.length > 0) {
      throw new Error(`${file}: seeded concepts missing after write: ${missing.join(', ')}`);
    }
    if (facts !== (expected.pgvector ?? []).length) {
      throw new Error(
        `${file}: expected ${(expected.pgvector ?? []).length} semantic_facts row(s), ` +
          `found ${facts}`,
      );
    }

    console.log(
      `Seeded task: ${fixture.id ?? file} — ${concepts.length} concept(s), ` +
        `${facts} semantic_facts row(s)`,
    );
  }

  console.log(`All ${fixtures.length} task file(s) seeded successfully.`);
} finally {
  await driver.close();
  await pool.end();
}
