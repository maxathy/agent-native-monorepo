import pg from 'pg';

export interface PgvectorConfig {
  connectionString: string;
}

export async function createPgvectorPool(config: PgvectorConfig): Promise<pg.Pool> {
  const pool = new pg.Pool({ connectionString: config.connectionString });

  // Ensure pgvector extension is available
  const client = await pool.connect();
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
  } finally {
    client.release();
  }

  return pool;
}
