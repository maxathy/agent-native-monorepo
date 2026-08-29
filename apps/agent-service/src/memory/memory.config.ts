import { z } from 'zod';

const MemoryConfigSchema = z.object({
  databaseUrl: z.string().min(1),
  neo4jUri: z.string().min(1),
  neo4jUser: z.string().min(1),
  neo4jPassword: z.string().min(1),
});

export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;

/**
 * Reads the memory axis from the environment.
 *
 * Memory and model availability are independent. Switching the whole
 * dependency set on `GOOGLE_API_KEY`, as this service used to, meant a
 * developer with Postgres but no API key got stub memory.
 *
 * Returns `null` when neither variable is set — the no-database path that
 * keeps a clone with no `.env` working, which P0-A's acceptance criteria
 * require and `test/runs.e2e-spec.ts` depends on.
 *
 * Half-configured throws. `DATABASE_URL` without `NEO4J_URI` cannot serve
 * hybrid retrieval, and quietly falling back to no-op writers because a
 * configured database is missing is the defect this whole change removes.
 */
export function readMemoryConfig(env: NodeJS.ProcessEnv = process.env): MemoryConfig | null {
  const databaseUrl = env['DATABASE_URL'];
  const neo4jUri = env['NEO4J_URI'];

  if (!databaseUrl && !neo4jUri) return null;

  return MemoryConfigSchema.parse({
    databaseUrl,
    neo4jUri,
    neo4jUser: env['NEO4J_USER'] ?? 'neo4j',
    neo4jPassword: env['NEO4J_PASSWORD'] ?? 'password',
  });
}
