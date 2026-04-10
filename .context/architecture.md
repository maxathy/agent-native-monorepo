# Architecture

## What This Repo Is

`agent-native-monorepo` is an extraction of production patterns from a proprietary agentic
platform, sanitized for public consumption. It is **not** a tutorial, starter kit, or SaaS
template. It exists to demonstrate architectural thinking in two scarce domains simultaneously:

1. **Senior monorepo engineering** — Yarn 4 workspaces, Turborepo build orchestration,
   shared TypeScript configs, contract-first package design.
2. **Production agentic systems** — LangGraph state machines with non-trivial memory
   architecture, OpenTelemetry instrumentation, crash-safe idempotent writes.

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
and access patterns. All three tiers are exposed through `packages/memory-core`.

### Working Memory (Per-Run)

- **Scope:** In-process, ephemeral — destroyed at run completion.
- **Implementation:** LangGraph `AgentState` object. No external I/O.
- **Purpose:** Accumulates intermediate reasoning, tool outputs, and retrieved context
  within a single agent invocation.

### Episodic Memory (Session-Scoped)

- **Scope:** Persisted across runs, scoped to a `session_id`.
- **Implementation:** Postgres table via Drizzle ORM.
- **TTL:** Configurable via `EPISODE_TTL_DAYS` (default 90 days).
- **Purpose:** Full turn history. Raw material for Semantic tier promotion.

### Semantic Memory (Long-Term Hybrid)

Two complementary indices, written atomically by the `reflect` node:

- **Neo4j Knowledge Graph:** Typed nodes (`:Concept`, `:Fact`, `:Session`) and relationships.
  Enables symbolic multi-hop traversal for explainable relational recall.
- **pgvector Collection:** Dense embeddings (text-embedding-3-small, 1536-dim). Enables
  cosine similarity search for paraphrase and synonym recall.

**Why both?** Dense search finds semantically similar facts but cannot follow relational
chains. Graph traversal follows explicit relationships but misses paraphrase variants.
Together they provide complementary recall paths that reduce false negatives. Results
are merged via Reciprocal Rank Fusion (RRF).

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
- A state machine (not a chain) was chosen for fault tolerance: each node is independently
  retriable, and the `reflect` node uses idempotent writes (Cypher MERGE, pgvector upsert)
  for crash recovery.

## NestJS 11 Microservice

The LangGraph graph is hosted inside a NestJS 11 microservice (`apps/agent-service`):

- **POST /runs** — Request/response mode. Waits for `egress`, returns `RunResponse`.
- **POST /runs/stream** — Streaming mode. Emits SSE events per node completion.
- **Global concerns:** ZodValidationPipe, AuditInterceptor (structured logging),
  LoggingInterceptor (correlation ID via AsyncLocalStorage), HttpExceptionFilter.
- **Observability:** One OTel span per graph node, child spans for pgvector search
  and Neo4j expansion, OTLP HTTP export.
