import { EMBEDDING_DIMENSIONS, l2Normalize } from '@repo/memory-core';

/**
 * The vector a seeded fact is stored with.
 *
 * Deterministic on purpose — a seed that had to be embedded by the live model
 * would make seeding cost money and make the seeded corpus drift with the
 * model. What it must not be is on a different scale from what the agent
 * writes: `sin(i * 0.01)` over 768 dimensions has an L2 norm of 19.364676,
 * against the live path's normalized 1.000000. Cosine ops divide the norms out
 * and hide the difference from retrieval, which is exactly what makes it a
 * trap — the first grader that reads a distance rather than a rank sees two
 * corpora that are not comparable.
 *
 * The dimension comes from `EMBEDDING_DIMENSIONS`, so a model change is one
 * edit and a migration rather than a search across the fixtures.
 */
export function fixtureEmbedding(seed = 0.01): number[] {
  return l2Normalize(new Array(EMBEDDING_DIMENSIONS).fill(0).map((_, i) => Math.sin(i * seed)));
}
