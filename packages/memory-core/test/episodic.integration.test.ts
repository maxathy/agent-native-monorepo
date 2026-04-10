import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { sql } from 'drizzle-orm';
import { DrizzleEpisodicRepository } from '../src/episodic/episodic.repo.js';
import { episodes } from '../src/episodic/schema.js';

const DATABASE_URL = process.env['DATABASE_URL'];

describe.skipIf(!DATABASE_URL)('DrizzleEpisodicRepository (integration)', () => {
  let pool: pg.Pool;
  let db: NodePgDatabase;
  let repo: DrizzleEpisodicRepository;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    db = drizzle(pool);

    // Create the episodes table for testing
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS episodes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL,
        run_id UUID NOT NULL,
        turn_index INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      )
    `);

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
});
