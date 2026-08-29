/**
 * The one place the embedding dimension is decided.
 *
 * Every Zod schema, every DDL statement, every fixture vector and every stub
 * embedding in this repository derives from this constant. It exists because
 * the dimension was previously a literal in thirteen places, which made
 * changing the embedding model a search-and-replace across four packages
 * rather than an edit and a migration.
 *
 * 768 is the `outputDimensionality` requested from `gemini-embedding-001`,
 * not that model's native width. It is chosen rather than inherited: pgvector
 * refuses an HNSW index above 2000 dimensions, so the native 3072 output would
 * force a `halfvec` column and a different operator class. Measured against
 * `pgvector/pgvector:pg16` (pgvector 0.8.2):
 *
 *     CREATE INDEX ON t USING hnsw (e vector_cosine_ops);
 *     ERROR:  column cannot have more than 2000 dimensions for hnsw index
 */
export const EMBEDDING_DIMENSIONS = 768;

/**
 * The embedding model. `text-embedding-004` preceded it and is retired for
 * `embedContent`, which is why a request with a live API key used to 500.
 */
export const EMBEDDING_MODEL = 'gemini-embedding-001';

/**
 * Scales a vector to unit L2 norm.
 *
 * Required, not defensive. A Matryoshka embedding truncated to a narrower
 * width is no longer unit-norm: measured 2026-08-29 against the live service,
 * `gemini-embedding-001` returns L2 norm 0.583182 at `outputDimensionality:
 * 768` and exactly 1.000000 at its native 3072. `vector_cosine_ops` would
 * tolerate the un-normalized vector because cosine distance divides the norms
 * out, but the stored representation should be canonical — a later switch to
 * inner-product ops silently returns wrong distances otherwise.
 *
 * A zero vector has no direction to preserve and is returned unchanged rather
 * than producing NaNs.
 */
export function l2Normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) return vector;
  return vector.map((value) => value / norm);
}
