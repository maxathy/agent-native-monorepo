import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { DrizzleEpisodicRepository } from '../src/episodic/episodic.repo.js';
import { runMigrations } from '../src/migrate.js';
import { episodes } from '../src/episodic/schema.js';
import { skipUnlessIntegrationEnv } from './integration-env.js';

const DATABASE_URL = process.env['DATABASE_URL'];

const SKIP = skipUnlessIntegrationEnv('DrizzleEpisodicRepository (integration)', 'DATABASE_URL');

describe.skipIf(SKIP)('DrizzleEpisodicRepository (integration)', () => {
  let pool: pg.Pool;
  let db: NodePgDatabase;
  let repo: DrizzleEpisodicRepository;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    db = drizzle(pool);

    // The migration is the only DDL for this table. A test that creates its
    // own can drift from the one production runs against.
    await runMigrations(pool);

    // Clean up any prior test data
    await db.delete(episodes);

    repo = new DrizzleEpisodicRepository(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  const sessionId = '550e8400-e29b-41d4-a716-446655440000';
  const runId = '550e8400-e29b-41d4-a716-446655440001';

  it('writes and reads back an episode', async () => {
    const { id } = await repo.write({
      sessionId,
      runId,
      turnIndex: 0,
      role: 'user',
      content: 'What is LangGraph?',
    });

    expect(id).toBeDefined();

    const rows = await repo.findBySession({ sessionId });
    expect(rows.length).toBeGreaterThanOrEqual(1);

    const written = rows.find((r) => r.id === id);
    expect(written).toBeDefined();
    expect(written!.content).toBe('What is LangGraph?');
    expect(written!.role).toBe('user');
    expect(written!.turnIndex).toBe(0);
  });

  it('writes multiple turns and retrieves in order', async () => {
    await repo.write({
      sessionId,
      runId,
      turnIndex: 1,
      role: 'assistant',
      content: 'LangGraph is a framework for building stateful agents.',
    });

    await repo.write({
      sessionId,
      runId,
      turnIndex: 2,
      role: 'user',
      content: 'How does it handle memory?',
    });

    const rows = await repo.findBySession({ sessionId, limit: 10 });
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  it('respects the limit parameter', async () => {
    const rows = await repo.findBySession({ sessionId, limit: 1 });
    expect(rows.length).toBe(1);
  });

  it('stores and retrieves metadata', async () => {
    const { id } = await repo.write({
      sessionId,
      runId,
      turnIndex: 3,
      role: 'tool',
      content: 'Search results: ...',
      metadata: { toolName: 'web-search', durationMs: 450 },
    });

    const rows = await repo.findBySession({ sessionId });
    const row = rows.find((r) => r.id === id);
    expect(row?.metadata).toEqual({ toolName: 'web-search', durationMs: 450 });
  });

  describe('the (session_id, turn_index) natural key', () => {
    const replaySession = '550e8400-e29b-41d4-a716-4466554400ff';

    it('lands a replayed turn on the same row', async () => {
      const first = await repo.write({
        sessionId: replaySession,
        runId,
        turnIndex: 0,
        role: 'user',
        content: 'What is LangGraph?',
      });

      const replayed = await repo.write({
        sessionId: replaySession,
        runId,
        turnIndex: 0,
        role: 'user',
        content: 'What is LangGraph?',
      });

      expect(replayed.id).toBe(first.id);
      const rows = await repo.findBySession({ sessionId: replaySession });
      expect(rows).toHaveLength(1);
    });

    it('does not duplicate a turn re-sent under a different run', async () => {
      // `reflect` writes the whole client-supplied history, so run 2 of a
      // session re-writes turn 0 under a fresh run_id. Keyed on run_id this
      // would return turn 0 once per run.
      await repo.write({
        sessionId: replaySession,
        runId: '550e8400-e29b-41d4-a716-4466554400aa',
        turnIndex: 0,
        role: 'user',
        content: 'What is LangGraph?',
      });

      const rows = await repo.findBySession({ sessionId: replaySession });
      expect(rows).toHaveLength(1);
    });
  });
});
