---
id: P0-B
title: Reconcile documented claims with implemented behavior
tier: 0
status: shipped
size: M
depends_on: []
blocks: []
issue: null
superseded_by: null
---

# P0-B · Reconcile documented claims with implemented behavior

## Problem

The documentation describes a system the code does not implement. This is not a matter of
docs lagging by a release — several capabilities are described in four places each and
implemented in none.

The inventory below was produced by auditing every capability claim in `README.md` and
`.context/`, then grepping the source for its implementation. Each row was verified
directly; the "hits in source" counts exclude `dist/`.

| #   | Claim                                                 | Documented at                                                  | Reality                                                                                                                                                                                                            |
| --- | ----------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | "Three-Brain memory architecture"                     | README:7 and throughout                                        | `runs.service.ts:58` returns `[]` for retrieval; `:85-96` are no-op writers. `HybridRetrievalFacade`, the Drizzle repo, and the Neo4j/pgvector writers are never constructed outside `packages/memory-core/test/`. |
| 2   | "crash-safe idempotent writes"                        | README:74, architecture.md:12                                  | `graph.ts:64` compiles with no checkpointer. Episodic write is a bare `INSERT` (`episodic.repo.ts`) with no natural key or conflict clause, so a retry duplicates every turn.                                      |
| 3   | "each node is independently retriable"                | architecture.md:88-89                                          | 0 occurrences of `retryPolicy` in source.                                                                                                                                                                          |
| 4   | "written atomically by the reflect node"              | README:148, architecture.md:58                                 | `reflect.node.ts:44-89` is three sequential await loops across Postgres, Neo4j and pgvector — no transaction, no outbox, no compensation.                                                                          |
| 5   | "Configurable TTL (default 90 days)"                  | README:144, architecture.md:53, glossary.md:7, .env.example:20 | 0 hits for `ttl\|expires_at\|retention\|prune`. No `expires_at` column, no cleanup job.                                                                                                                            |
| 6   | "HNSW index"                                          | glossary.md:34                                                 | 0 hits for `hnsw\|ivfflat\|create index`. Every `<=>` query is a sequential scan.                                                                                                                                  |
| 7   | Redis cache in the system diagram                     | README:23,30; docker-compose.yml; e2e.yml; .env.example        | 0 hits for `redis` in source. Provisioned in three places, used in none.                                                                                                                                           |
| 8   | "integration tests using testcontainers"              | workflows.md:83, conventions.md:40                             | `testcontainers` appears in 0 package manifests. The suites connect to externally provided URLs.                                                                                                                   |
| 9   | "E2E (Playwright): Full stack via docker-compose"     | conventions.md:42                                              | `playwright.config.ts` boots only the Vite dev server, and no workflow runs `test:e2e`.                                                                                                                            |
| 10  | "Service (Jest): mocked graph execution"              | conventions.md:38-39                                           | The spec builds the real graph with no mocks, and no workflow runs it.                                                                                                                                             |
| 11  | "Graph nodes never throw"                             | conventions.md:48                                              | `ingress.node.ts:16` throws on parse failure; `retrieve` and `reflect` propagate I/O errors.                                                                                                                       |
| 12  | "Node.js 20.x or 22.x"                                | README:102                                                     | `ci.yml` uses 24.x; `e2e.yml` and `agent-eval.yml` use 20.x; the Dockerfiles use node:26. Four answers.                                                                                                            |
| 13  | "child spans for pgvector search and Neo4j expansion" | architecture.md:100-101                                        | The spans exist, in classes the application never instantiates (see row 1).                                                                                                                                        |
| 14  | "contract-first package design"                       | README:73, architecture.md:10                                  | No OpenAPI document, no API versioning, every package at `0.0.0`. `StreamEvent.delta` and `.state` are declared in the schema and emitted 0 times.                                                                 |
| 15  | RRF as "the architectural differentiator"             | README:148,155                                                 | The fusion key in `retrieval-facade.ts` is `entityId ?? content`; Neo4j candidates always carry `entityId` and pgvector candidates never do, so scores from the two sources are never summed. It interleaves.      |

Three further defects surfaced by the same audit are not documentation problems and are
tracked in P2-A rather than here: vector search applies no session filter (so retrieval
crosses session boundaries), Neo4j `MERGE` has no backing uniqueness constraint, and there
are no migrations at all — the only `CREATE TABLE episodes` in the repository lives inside
an integration test.

## Why it matters

This repository is read before it is run. A reviewer who opens `README.md`, believes it,
then opens `runs.service.ts` finds two of the three advertised memory tiers wired to
`async () => {}`. The gap between claim and code is more damaging than the missing
capability would be on its own, because it calls the rest of the document into question.

Closing it does not require building all fifteen. It requires that every sentence in the
documentation be true on the day it is read.

## Scope

For each row: either implement it, or delete the claim and record the capability as
planned. The default is **delete the claim** — implementation is what the rest of the
backlog is for, and this PRD is explicitly the cheap half.

- Add `docs/STATUS.md`: one row per capability with a status of
  `implemented` / `stubbed` / `planned`, and for `planned`, the PRD that delivers it.
- Rewrite the false claims in `README.md`, `.context/architecture.md`,
  `.context/conventions.md`, and `.context/glossary.md` to match the code.
- Link `docs/STATUS.md` from the README so the honest version is one click from the
  ambitious one.
- Remove the Redis service from `docker-compose.yml`, `e2e.yml`, and `.env.example`, or
  open a PRD for the cache it was meant to be.
- Pin one Node version across README, all five workflows, and the three Dockerfiles.

### Non-goals

- Implementing any of the fifteen. Rows 1, 2, 3, 4, 6 and 15 are P2-A; row 9 and 10 are
  P0-A; row 5 and 14 have no PRD yet and should get one if they are worth keeping.
- Touching `.agents/reviewer.md` rule 10, which is a separate decision (see below).

## Design

`docs/STATUS.md` is the load-bearing artifact. A capability matrix that a reader can check
against the code in a minute is worth more than prose that reads well, and it is the file
this PRD leaves behind for future sessions to keep current.

Wording discipline for the rewrite: the README may describe the _architecture_ in the
present tense, but a capability that is not wired must not be. "Semantic memory is
maintained across two complementary indices" becomes "…is designed to be maintained…,"
or better, the sentence moves to `docs/STATUS.md` as a `planned` row with a PRD link.

## Acceptance criteria

- [x] `docs/STATUS.md` exists with a row for all fifteen claims above, each carrying a
      status and, where planned, the owning PRD. Sixteen rows: the retired embedding model
      was added as row 16.
- [x] Every sentence in `README.md` and `.context/` that describes a capability is either
      true of the code at HEAD or marked as planned.
- [x] `grep -rn "testcontainers\|HNSW\|TTL" README.md .context/` returns only text that
      is accurate or explicitly forward-looking. Four hits remain, each a statement that
      the thing is absent.
- [x] One Node version appears in README, all workflows, and all Dockerfiles. Node 24.
- [x] Redis is absent from compose, CI, and `.env.example`.
- [x] `yarn lint:docs` passes.

## Risks and open questions

Resolved during implementation:

- **Rows 9 and 10 were already closed by P0-A**, as the reference note predicted, and row 8
  was half-closed — `.agents/reviewer.md` carried the correction, while `workflows.md`,
  `memory-author.md` and `test-author.md` still asserted testcontainers. The lesson is
  narrower than "re-verify": a claim deleted in one file is not deleted, because these
  claims were always written in three or four places at once, which is how they survived
  in the first place.
- **The audit missed a claim, and it was the one that was actually breaking a reader.**
  `.env.example` documented `gemini-2.0-flash + text-embedding-004`; the code uses
  `gemini-2.5-flash`, and `text-embedding-004` is retired. The inventory was built by
  grepping source for documented capabilities, which finds capabilities that do not exist
  and misses a documented capability that exists and is broken. Row 16 of `docs/STATUS.md`
  is that row. The fix is P2-A's — it is a dimension decision — but the claim is corrected
  here and the README now warns before telling anyone to set the key.
- **`POST /runs/stream` compounds a node failure into a second error.** Once the first SSE
  frame is written the response is committed, so `GlobalHttpExceptionFilter` writing a JSON
  body onto it throws `ERR_HTTP_HEADERS_SENT` and the client is left with an open stream
  that stops after `ingress`. Observed against the compose stack with `GOOGLE_API_KEY` set.
  It belongs with the error handling in P2-A, which has no file yet — this is the record
  until it does.
- **Pinning Node moved the images down two majors**, from 26 to 24, so it was verified
  rather than assumed: all three images rebuild, `docker compose --profile full` reaches
  five healthy containers, and both README quickstart curls return through the gateway.
  Five, not six — Redis is gone.

Open, and handed on:

- **The honest README is a less impressive README.** That is the correct trade. A
  calibrated claim survives a code read; an inflated one does not, and this repository is
  read by people who will check.
- **`.agents/reviewer.md` rule 10 forbids "medical/clinical terms"** and pins the system
  prompt to a single string. Tier 3 (P3-A through P3-D) is a payer-domain vertical and
  cannot proceed under that rule. The rule was written to keep proprietary material out of
  a sanitized extraction, which is still the right instinct — the replacement should ban
  what actually matters: real PHI, real member or claim data, and license-encumbered code
  sets such as CPT. **This needs a decision before Tier 3 starts, and it belongs in an ADR
  rather than in this PRD.**
- Rule 7 of the same file required integration tests "using testcontainers with real
  containers," which is row 8 of the inventory. Fixed here, along with the same claim in
  `.context/workflows.md`, `.agents/memory-author.md` and `.agents/test-author.md`.
- **`docs/STATUS.md` is prose, and nothing lints prose.** `scripts/lint-docs.mjs` checks
  PRD and ADR structure and cannot check that a row's evidence still resolves. What guards
  the matrix is that every row names a file and a line, plus the rule in
  `.context/conventions.md` and `.agents/reviewer.md` that a change moving a row updates it
  in the same pull request. If it drifts anyway, the mechanical version is a check that
  every `file.ts:NN` in the matrix exists — cheap, and worth a PRD if this file ages badly.

## References

- The inventory above was verified at commit `34fe9bb`. Re-verify before acting; rows may
  have been closed by P0-A or P2-A in the interim.
