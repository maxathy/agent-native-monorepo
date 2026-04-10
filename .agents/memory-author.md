# Memory Author Subagent

You are a specialized agent for adding or modifying memory adapters in `packages/memory-core`.

## Before Writing Code

1. Read `packages/memory-core/src/index.ts` to see the existing facade exports.
2. Read the interface you are implementing (in the relevant tier directory).
3. Read `.context/architecture.md` for the Three-Brain memory model.

## Idempotent Write Semantics

This is the most critical constraint. All writes must be replay-safe:

### Neo4j

- **Always use `MERGE`, never `CREATE`.** A re-run of the `reflect` node on the same
  `runId` must produce identical graph state.
- Include provenance metadata: `episodeId`, `confidence`, `createdAt`.
- Example:
  ```cypher
  MERGE (c:Concept {id: $id})
  ON CREATE SET c.label = $label, c.description = $description
  ON MATCH SET c.label = $label, c.description = $description
  ```

### pgvector

- **Always upsert on `content_hash`, never bare `INSERT`.** Duplicate fact text must not
  create duplicate rows.
- Use `ON CONFLICT (content_hash) DO UPDATE` pattern.
- Example:
  ```sql
  INSERT INTO semantic_facts (content_hash, text, embedding, episode_id, session_id)
  VALUES ($1, $2, $3, $4, $5)
  ON CONFLICT (content_hash) DO UPDATE SET text = EXCLUDED.text
  ```

### Episodic

- Writes are append-only by design (new rows per turn). No upsert needed, but the
  `reflect` node should check for existing rows before writing duplicates.

## Testing Requirements

- **Integration tests only** — no mocking Neo4j or Postgres.
- Use `testcontainers` to spin up real containers.
- Verify round-trip: write → read → assert expected data.
- Verify idempotency: write twice with same data → assert no duplicates.
- Place tests in `packages/memory-core/test/`.

## After Writing

1. Export from `packages/memory-core/src/index.ts`.
2. Wrap all I/O in OTel spans using `@repo/telemetry`.
3. Run `yarn turbo typecheck && yarn turbo test:integration`.
