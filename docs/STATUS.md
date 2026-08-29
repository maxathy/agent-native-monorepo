# Capability status

_Verified against `main` on 2026-08-29._

This repository is read before it is run, and for a while it described a system it did not
implement. This file is the correction: one row per capability the documentation claims,
what is actually behind it, and — where the answer is "not much yet" — the PRD that owns
finishing it.

The rule that keeps it honest lives in `.context/conventions.md`: a capability claim in
`README.md` or `.context/` must be true of the code at HEAD. Anything aspirational either
gets a row here or goes to `docs/prd/`.

## How to read the status column

| Status        | Means                                                                                |
| ------------- | ------------------------------------------------------------------------------------ |
| `implemented` | Wired into the running service and exercised by a test or a workflow.                |
| `stubbed`     | The code exists and is unit- or integration-tested, but nothing in the app calls it. |
| `planned`     | Not built. The claim has been removed from the docs or marked forward-looking.       |
| `broken`      | Built and reachable, but failing today against a live dependency.                    |
| `removed`     | Provisioned but never used. The provisioning is gone.                                |

`stubbed` is the row to watch. It is the gap that produced this file: a class with a clean
interface, an integration test, and an OTel span, that no request path ever constructs.

## The matrix

| #   | Capability                                          | Status        | Evidence at HEAD                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Owner |
| --- | --------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| 1   | Three-Brain memory (working, episodic, semantic)    | `implemented` | `MemoryModule` constructs the pool, the driver, the four adapters and the facade (`memory/memory.module.ts:55-121`) and `RunsService` injects them by token. Verified against live stores: one `POST /runs` writes two `episodes` rows, one `:Concept`, one `:Fact` and one `semantic_facts` row.                                                                                                                                                                                                                                    | —     |
| 2   | Crash-safe idempotent writes                        | `implemented` | Episodic writes upsert on the `(session_id, turn_index)` natural key (`episodic.repo.ts:57`); Neo4j `MERGE` and pgvector upsert-on-`content_hash` were already idempotent. The graph compiles with a checkpointer when one is configured (`graph/graph.ts:107`). Three runs of one session leave one row per turn.                                                                                                                                                                                                                   | —     |
| 3   | Nodes independently retriable                       | `implemented` | `IO_RETRY` on every node that performs I/O — `retrieve`, `plan`, `act`, `distill`, `reflect` (`graph/graph.ts:62`). A node failing twice and succeeding on the third attempt yields a successful run; a 4xx is not retried (`graph/graph.test.ts:108`).                                                                                                                                                                                                                                                                              | —     |
| 4   | Semantic writes converge under replay               | `implemented` | Restated, not ticked. ADR 0001 ruled out the mechanism that gives atomicity across the two indices, so this is the weaker guarantee actually delivered: `reflect` is a function of `state.extraction`, every write is idempotent, and retry re-runs it. A crash between the Neo4j and pgvector writes leaves them disagreeing until the retry, not permanently. An outbox would be a new PRD.                                                                                                                                        | —     |
| 5   | Configurable episodic TTL                           | `planned`     | `EPISODE_TTL_DAYS` was read by nothing; no `expires_at` column, no cleanup job. The variable and the claim are gone.                                                                                                                                                                                                                                                                                                                                                                                                                 | —     |
| 6   | HNSW index on the embedding column                  | `implemented` | `migrations/0001_semantic_facts.sql` creates it with `vector_cosine_ops`. `\d semantic_facts` on a migrated database lists `semantic_facts_embedding_hnsw`.                                                                                                                                                                                                                                                                                                                                                                          | —     |
| 7   | Redis cache                                         | `removed`     | 0 references in source. It was provisioned in `docker-compose.yml`, `e2e.yml` and `.env.example` and used in none of them.                                                                                                                                                                                                                                                                                                                                                                                                           | —     |
| 8   | Integration tests against real Postgres and Neo4j   | `implemented` | `packages/memory-core/test/` runs against real databases — `docker-compose.yml` locally, service containers in `e2e.yml`. It has never used `testcontainers`, which appears in 0 manifests; that wording is gone.                                                                                                                                                                                                                                                                                                                    | —     |
| 9   | Playwright E2E against the full compose stack       | `implemented` | `e2e.yml:50-86` brings up `docker compose --profile full` and points the suite at the console container via `E2E_BASE_URL`.                                                                                                                                                                                                                                                                                                                                                                                                          | P0-A  |
| 10  | Service tests over HTTP with stub graph deps        | `implemented` | `ci.yml:29` runs `turbo test:service`; `test/runs.e2e-spec.ts:17-19` clears `GOOGLE_API_KEY` to pin the stub dependency set.                                                                                                                                                                                                                                                                                                                                                                                                         | P0-A  |
| 11  | Graph nodes never throw                             | `planned`     | `nodes/ingress.node.ts:16` throws on a parse failure; `retrieve` and `reflect` propagate I/O errors. The convention now states the actual contract.                                                                                                                                                                                                                                                                                                                                                                                  | —     |
| 12  | One Node version across README, CI and images       | `implemented` | Node 24 in `README.md`, all five workflows, and all three Dockerfiles.                                                                                                                                                                                                                                                                                                                                                                                                                                                               | —     |
| 13  | Child spans for pgvector search and Neo4j expansion | `implemented` | The readers are constructed by `MemoryModule`, so their spans now appear under the node that opened them. Asserted from an exported trace: `graph/spans.test.ts:114-124`.                                                                                                                                                                                                                                                                                                                                                            | —     |
| 14  | Contract-first package design                       | `stubbed`     | Zod schemas are the source of truth and types are inferred from them. There is no OpenAPI document, no API versioning, and every package sits at `0.0.0`. `StreamEvent.error` is declared (`run-response.schema.ts:36`) and emitted — a failed stream ends in a frame carrying it, asserted from an observed response at `runs.e2e-spec.ts:175`. `delta` and `.state` remain declared and emitted 0 times.                                                                                                                           | —     |
| 15  | RRF fusion of graph and vector results              | `implemented` | Both readers return facts drawn from one universe — `mergeFact` writes a `:Fact` keyed on the same hash pgvector uses (`neo4j.writer.ts:90`) — and `rrfMerge` keys on `contentHash` (`retrieval-facade.ts:70`). A fact both retrievers return appears once, scored at the sum of its two reciprocal ranks. ADR 0004 records the decision.                                                                                                                                                                                            | —     |
| 16  | Gemini dependency set                               | `implemented` | `text-embedding-004` is gone: embeddings call `gemini-embedding-001:embedContent` with `outputDimensionality` and are L2-normalized (`model/gemini-embedder.ts:30-60`), and the dimension is one constant (`semantic/embedding.ts:19`). Verified 2026-08-29 against a live key: `POST /runs` returns 200 and stores 768-dimension vectors at L2 norm `1.000000`. The earlier `403 PERMISSION_DENIED` was a revoked key exported from a shell rc shadowing `.env`, which the service now reads and warns about (`load-env.ts:42-58`). | —     |

## What this means for a reader

The chassis is real: the graph runs, the HTTP surface is validated end to end, every node
emits a span, and the compose stack comes up on five healthy containers. Both quickstart
curls in `README.md` work against a fresh clone with no `.env` — verified through the
gateway against `docker compose --profile full` on 2026-08-28.

The memory system is a set of well-tested adapters that the service does not yet
construct. Rows 1, 2, 3, 4, 6, 13, 15 and 16 are one piece of work — wiring
`packages/memory-core` into `apps/agent-service` — and that work is P2-A in
[the backlog](prd/README.md).

Rows 5, 11 and 14 have no owner. They are small, they are honestly labelled, and inventing
a PRD id for each would put three rows in the backlog that nobody has agreed to.

## Keeping this file true

Nothing lints prose. What keeps this file honest is that it is short, every row names a
file and a line, and `.context/conventions.md` and `.agents/reviewer.md` both require a
pull request that moves a row to move it here in the same change. If a row's evidence no
longer resolves, the row is wrong — fix it rather than working around it.
