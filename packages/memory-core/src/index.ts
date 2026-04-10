// Working Memory — per-run, in-process, ephemeral
export {
  WorkingMemorySchema,
  type WorkingMemory,
  seedWorkingMemory,
  mergeRetrievedContext,
  appendToolOutput,
  addTokenCounts,
} from './working/index.js';

// Episodic Memory — session-scoped, Postgres + Drizzle
export { episodes } from './episodic/schema.js';
export {
  EpisodeFindInputSchema,
  EpisodeWriteInputSchema,
  type EpisodeFindInput,
  type EpisodeWriteInput,
  type EpisodicRepository,
  DrizzleEpisodicRepository,
} from './episodic/episodic.repo.js';

// Semantic Memory — Neo4j knowledge graph
export {
  EntityWriteSchema,
  RelationshipWriteSchema,
  type Neo4jWriter,
  CypherNeo4jWriter,
} from './semantic/neo4j/neo4j.writer.js';
export { type Neo4jReader, CypherNeo4jReader } from './semantic/neo4j/neo4j.reader.js';
export { createNeo4jClient } from './semantic/neo4j/neo4j.client.js';

// Semantic Memory — pgvector dense embeddings
export {
  FactUpsertSchema,
  type PgvectorWriter,
  PgPgvectorWriter,
} from './semantic/pgvector/pgvector.writer.js';
export { type PgvectorReader, PgPgvectorReader } from './semantic/pgvector/pgvector.reader.js';
export { createPgvectorPool } from './semantic/pgvector/pgvector.client.js';

// Retrieval Facade — hybrid Neo4j + pgvector with RRF merge
export {
  RetrievalQuerySchema,
  RetrievalCandidateSchema,
  type RetrievalQuery,
  type RetrievalCandidate,
  type RetrievalFacade,
  HybridRetrievalFacade,
} from './semantic/retrieval-facade.js';
