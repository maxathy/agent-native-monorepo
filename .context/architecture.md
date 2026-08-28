# Architecture

## What This Repo Is

`agent-native-monorepo` is an extraction of production patterns from a proprietary agentic
platform, sanitized for public consumption. It is **not** a tutorial, starter kit, or SaaS
template. It exists to demonstrate architectural thinking in two scarce domains simultaneously:

1. **Senior monorepo engineering** — Yarn 4 workspaces, Turborepo build orchestration,
   shared TypeScript configs, Zod schemas as the source of truth for cross-package types.
2. **Production agentic systems** — LangGraph state machines with non-trivial memory
   architecture and OpenTelemetry instrumentation.

> **This document describes the design. `docs/STATUS.md` records what is wired.** The two
> diverge today, most of all in the memory tiers: the adapters below exist and are tested,
> and `apps/agent-service` does not construct them. Read the matrix before you rely on a
> sentence here.

## System Overview

```
┌─────────────┐     ┌─────────────┐     ┌──────────────────────────────┐
│   console    │────▶│   gateway    │────▶│      agent-service           │
│  (React/Vite)│     │  (Express)   │     │   (NestJS 11 + LangGraph)   │
└─────────────┘     └─────────────┘     └──────────┬───────────────────┘
                                                    │
                                          ┌─────────┴─────────┐
                                          │    memory-core     │
                                          │  (unified facade)  │
                                          └───┬───────┬───────┘
                                              │       │
                                   ┌──────────┘       └──────────┐
                                   ▼                              ▼
                          ┌────────────────┐           ┌─────────────────┐
                          │ Postgres 16    │           │   Neo4j 5       │
                          │ + pgvector     │           │   Community     │
                          │ (Episodic +    │           │ (Knowledge      │
                          │  Dense Search) │           │  Graph)         │
                          └────────────────┘           └─────────────────┘
```

## The Three-Brain Memory Model

The memory system is divided into three tiers with distinct scopes, persistence strategies,
and access patterns. All three tiers are exposed through `packages/memory-core`. Only
Working Memory is reached by a live request today; see `docs/STATUS.md` rows 1-4.

### Working Memory (Per-Run)

- **Scope:** In-process, ephemeral — destroyed at run completion.
- **Implementation:** LangGraph `AgentState` object. No external I/O.
- **Purpose:** Accumulates intermediate reasoning, tool outputs, and retrieved context
  within a single agent invocation.

### Episodic Memory (Session-Scoped)

- **Scope:** Persisted across runs, scoped to a `session_id`.
- **Implementation:** Postgres table via Drizzle ORM.
- **Retention:** Unbounded. There is no expiry column and no cleanup job; a TTL is planned
  and unowned (`docs/STATUS.md` row 5).
- **Purpose:** Full turn history. Raw material for Semantic tier promotion.

### Semantic Memory (Long-Term Hybrid)

Two complementary indices, both written by the `reflect` node:

- **Neo4j Knowledge Graph:** Typed nodes (`:Concept`, `:Fact`, `:Session`) and relationships.
  Enables symbolic multi-hop traversal for explainable relational recall.
- **pgvector Collection:** Dense embeddings, 768-dim, on a sequential scan — there is no
  HNSW or IVFFlat index. Enables cosine similarity search for paraphrase and synonym
  recall.

The two writes are sequential, not atomic: `reflect` loops over Postgres, then Neo4j, then
pgvector. Each write is individually replay-safe, the set of them is not. The embedding
model is a live problem — `text-embedding-004` is retired, and choosing its replacement is
a dimension decision, so it travels with the wiring work in P2-A.

**Why both?** Dense search finds semantically similar facts but cannot follow relational
chains. Graph traversal follows explicit relationships but misses paraphrase variants.
Together they provide complementary recall paths that reduce false negatives. Results are
merged via Reciprocal Rank Fusion (RRF) — see ADR 0002, which also records that the
implementation currently interleaves rather than fuses, because the two sources key
differently.

```
Working Memory ──[reflect]──▶ Episodic (Postgres)
                              │
                              └──[reflect]──▶ Semantic
                                               ├── Neo4j (entities + relationships)
                                               └── pgvector (distilled fact embeddings)
```

## LangGraph Topology

The agent runs as a compiled `StateGraph` with six nodes:

```
START → ingress → retrieve → plan → act ⟲ (loop) → reflect → egress → END
```

- **act** self-loops while `stepCount < maxSteps && shouldContinue`.
- **reflect** is the sole writer to Episodic and Semantic tiers.
- A state machine (not a chain) was chosen for fault tolerance: nodes are the unit a
  checkpointer can resume from, and the write adapters are idempotent (Cypher MERGE,
  pgvector upsert on content hash) so that a resumed node is safe to re-run.
- **Neither half of that is switched on yet.** The graph compiles with no checkpointer and
  no `retryPolicy`, so a node failure fails the run. ADR 0001 records the choice of
  checkpointer and why it is not the same thing as durable execution; P2-A adds it.

## NestJS 11 Microservice

The LangGraph graph is hosted inside a NestJS 11 microservice (`apps/agent-service`):

- **POST /runs** — Request/response mode. Waits for `egress`, returns `RunResponse`.
- **POST /runs/stream** — Streaming mode. Emits SSE events per node completion.
- **Global concerns:** ZodValidationPipe, AuditInterceptor (structured logging),
  LoggingInterceptor (correlation ID via AsyncLocalStorage), HttpExceptionFilter.
- **Observability:** One OTel span per graph node, OTLP HTTP export. The child spans for
  pgvector search and Neo4j expansion are implemented in the reader classes, which the
  service does not construct — a live trace shows six node spans and no children.
