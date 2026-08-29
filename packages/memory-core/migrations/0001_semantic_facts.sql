-- Hand-written rather than generated: the embedding column is a pgvector
-- `vector(n)`, which drizzle-kit has no first-class column type for here.
--
-- The dimension is duplicated from EMBEDDING_DIMENSIONS on purpose. A applied
-- migration is a historical record and must not change meaning when a constant
-- does; changing the dimension is a new migration, not an edit to this one.
-- `embedding-dimensions.test.ts` fails if the two drift apart.
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "semantic_facts" (
	"content_hash" text PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(768) NOT NULL,
	"episode_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Without this every `<=>` query is a sequential scan. pgvector refuses an
-- HNSW index above 2000 dimensions, which is why EMBEDDING_DIMENSIONS is 768
-- and not gemini-embedding-001's native 3072.
CREATE INDEX "semantic_facts_embedding_hnsw" ON "semantic_facts"
	USING hnsw ("embedding" vector_cosine_ops);
--> statement-breakpoint
-- Retrieval is session-scoped by default, so the filter column is indexed.
CREATE INDEX "semantic_facts_session_id" ON "semantic_facts" ("session_id");
