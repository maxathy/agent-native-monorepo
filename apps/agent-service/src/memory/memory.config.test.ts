import { describe, it, expect } from 'vitest';
import { readMemoryConfig } from './memory.config.js';

describe('readMemoryConfig', () => {
  it('returns null when neither variable is set', () => {
    // The no-database path is load-bearing: a clone with no .env still has to
    // serve both README quickstart curls.
    expect(readMemoryConfig({})).toBeNull();
  });

  it('reads both stores with defaulted Neo4j credentials', () => {
    const config = readMemoryConfig({
      DATABASE_URL: 'postgresql://localhost:5432/agentdb',
      NEO4J_URI: 'bolt://localhost:7687',
    });

    expect(config).toEqual({
      databaseUrl: 'postgresql://localhost:5432/agentdb',
      neo4jUri: 'bolt://localhost:7687',
      neo4jUser: 'neo4j',
      neo4jPassword: 'password',
    });
  });

  it('names the missing variable when only one store is configured', () => {
    // Falling back to no-op writers because a configured database is missing
    // is the defect this whole change removes, so half-configured is an error
    // rather than a degraded mode — and the operator holding a half-written
    // .env has to be able to read which half.
    expect(() => readMemoryConfig({ DATABASE_URL: 'postgresql://localhost:5432/agentdb' })).toThrow(
      /neo4jUri is missing/,
    );
    expect(() => readMemoryConfig({ NEO4J_URI: 'bolt://localhost:7687' })).toThrow(
      /databaseUrl is missing/,
    );
  });
});
