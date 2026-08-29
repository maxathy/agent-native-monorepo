import { defineConfig } from 'drizzle-kit';

/**
 * `episodes` is generated from `src/episodic/schema.ts`. `semantic_facts` is
 * not: its embedding column is a pgvector `vector(n)`, which Drizzle has no
 * first-class column type for here, so that migration is hand-written and
 * lives beside the generated one.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/episodic/schema.ts',
  out: './migrations',
});
