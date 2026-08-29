import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { EMBEDDING_DIMENSIONS, l2Normalize } from './embedding.js';

describe('EMBEDDING_DIMENSIONS', () => {
  it('matches the dimension the semantic_facts migration declares', () => {
    // An applied migration is a historical record and cannot be edited to
    // follow the constant, so the two are duplicated by design. This is the
    // check that catches the drift: changing EMBEDDING_DIMENSIONS without
    // writing a new migration fails here rather than at the first INSERT.
    const migration = readFileSync(
      fileURLToPath(new URL('../../migrations/0001_semantic_facts.sql', import.meta.url)),
      'utf-8',
    );
    const declared = /"embedding" vector\((\d+)\)/.exec(migration);

    expect(declared).not.toBeNull();
    expect(Number(declared![1])).toBe(EMBEDDING_DIMENSIONS);
  });

  it('stays within pgvector’s HNSW dimension ceiling', () => {
    // pgvector refuses `USING hnsw` above 2000 dimensions. The migration
    // creates that index, so exceeding this makes the migration itself fail.
    expect(EMBEDDING_DIMENSIONS).toBeLessThanOrEqual(2000);
  });
});

describe('l2Normalize', () => {
  it('scales a vector to unit norm', () => {
    const normalized = l2Normalize([3, 4]);

    expect(normalized).toEqual([0.6, 0.8]);
  });

  it('preserves direction', () => {
    const normalized = l2Normalize([1, 2, 2]);

    expect(normalized[1]! / normalized[0]!).toBeCloseTo(2, 10);
  });

  it('returns a zero vector unchanged rather than producing NaNs', () => {
    expect(l2Normalize([0, 0, 0])).toEqual([0, 0, 0]);
  });
});
