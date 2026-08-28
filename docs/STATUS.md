# Capability status

_Verified against `main` on 2026-08-28._

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

| #   | Capability                                          | Status        | Evidence at HEAD                                                                                                                                                                                                                                                                                                                              | Owner |
| --- | --------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1   | Three-Brain memory (working, episodic, semantic)    | `stubbed`     | Working memory is real. Episodic and semantic are closures: `runs/runs.service.ts:56-61` returns `[]` for retrieval and `:84-96` are no-op writers.                                                                                                                                                                                           | P2-A  |
| 2   | Crash-safe idempotent writes                        | `stubbed`     | Neo4j `MERGE` and pgvector upsert-on-`content_hash` are idempotent in the adapters. The graph compiles with no checkpointer (`graph/graph.ts:64`) and the episodic write is a bare `INSERT` (`episodic.repo.ts:34-44`).                                                                                                                       | P2-A  |
| 3   | Nodes independently retriable                       | `planned`     | `retryPolicy` occurs 0 times in source. A node failure fails the run.                                                                                                                                                                                                                                                                         | P2-A  |
| 4   | Semantic writes are atomic across the two indices   | `planned`     | `nodes/reflect.node.ts:44-89` is three sequential `await` loops over Postgres, Neo4j and pgvector — no transaction, no outbox, no compensation.                                                                                                                                                                                               | P2-A  |
| 5   | Configurable episodic TTL                           | `planned`     | `EPISODE_TTL_DAYS` was read by nothing; no `expires_at` column, no cleanup job. The variable and the claim are gone.                                                                                                                                                                                                                          | —     |
| 6   | HNSW index on the embedding column                  | `planned`     | No `CREATE INDEX` anywhere; `pgvector.writer.ts:24-33` creates the table without one. Every `<=>` query is a sequential scan.                                                                                                                                                                                                                 | P2-A  |
| 7   | Redis cache                                         | `removed`     | 0 references in source. It was provisioned in `docker-compose.yml`, `e2e.yml` and `.env.example` and used in none of them.                                                                                                                                                                                                                    | —     |
| 8   | Integration tests against real Postgres and Neo4j   | `implemented` | `packages/memory-core/test/` runs against real databases — `docker-compose.yml` locally, service containers in `e2e.yml`. It has never used `testcontainers`, which appears in 0 manifests; that wording is gone.                                                                                                                             | —     |
| 9   | Playwright E2E against the full compose stack       | `implemented` | `e2e.yml:50-86` brings up `docker compose --profile full` and points the suite at the console container via `E2E_BASE_URL`.                                                                                                                                                                                                                   | P0-A  |
| 10  | Service tests over HTTP with stub graph deps        | `implemented` | `ci.yml:29` runs `turbo test:service`; `test/runs.e2e-spec.ts:17-19` clears `GOOGLE_API_KEY` to pin the stub dependency set.                                                                                                                                                                                                                  | P0-A  |
| 11  | Graph nodes never throw                             | `planned`     | `nodes/ingress.node.ts:16` throws on a parse failure; `retrieve` and `reflect` propagate I/O errors. The convention now states the actual contract.                                                                                                                                                                                           | —     |
| 12  | One Node version across README, CI and images       | `implemented` | Node 24 in `README.md`, all five workflows, and all three Dockerfiles.                                                                                                                                                                                                                                                                        | —     |
| 13  | Child spans for pgvector search and Neo4j expansion | `stubbed`     | The spans are real — `pgvector.reader.ts:16`, `neo4j.reader.ts:15` — in classes constructed only inside `packages/memory-core/test/`. A live trace shows six node spans and no children.                                                                                                                                                      | P2-A  |
| 14  | Contract-first package design                       | `stubbed`     | Zod schemas are the source of truth and types are inferred from them. There is no OpenAPI document, no API versioning, and every package sits at `0.0.0`. `StreamEvent.delta` and `.state` are declared and emitted 0 times — `runs.service.ts:196` sends `{ node }` alone, while `StreamViewer.tsx:69` renders a `delta` that never arrives. | —     |
| 15  | RRF fusion of graph and vector results              | `stubbed`     | `rrfMerge` is implemented and unit-tested, but the fusion key at `retrieval-facade.ts:47` is `entityId ?? content`. Neo4j candidates always carry `entityId`, pgvector candidates never do, so the two lists never collide and no score is ever summed. It interleaves.                                                                       | P2-A  |
| 16  | Gemini dependency set                               | `broken`      | `text-embedding-004` (`runs.service.ts:34`) is retired for `embedContent`, so `POST /runs` returns 500 and `POST /runs/stream` dies after the `ingress` frame whenever `GOOGLE_API_KEY` is set. The replacement changes the embedding dimension, and 768 is hardcoded in three places.                                                        | P2-A  |

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
