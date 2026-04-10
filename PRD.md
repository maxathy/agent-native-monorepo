# Product Requirements Document: agent-native-monorepo

> **Version:** 1.0.0  
> **Date:** 2026-04-09  
> **Status:** Binding specification for implementation

---

## 1. Executive Summary

`agent-native-monorepo` is a production-grade Yarn 4 monorepo chassis for stateful LangGraph agents, purpose-built for multi-agent development workflows. It is an extraction of production patterns from a proprietary agentic platform, sanitized for public consumption, and is intended as verifiable architectural proof for senior engineers and CTOs evaluating agentic systems work. The flagship application inside the monorepo is a NestJS 11 microservice that runs a LangGraph state machine with a **Three-Brain memory architecture**: a per-run Working Memory tier (LangGraph state object), a session-scoped Episodic tier (Postgres + Drizzle ORM), and a long-term Semantic tier comprising a hybrid **Neo4j 5 Knowledge Graph** for symbolic multi-hop traversal plus a **pgvector** collection for dense embedding similarity search. The repo sits at the intersection of two scarce skills — senior monorepo architecture and production agentic systems engineering — and is designed to pass a 30-second skim test and survive a deep technical drilldown.

---

## 2. Non-Goals

- **Not a full RAG pipeline.** The semantic retrieval layer is purpose-built for agent memory consolidation, not document ingestion at scale.
- **Not a vector database benchmark.** No benchmarking harness, no comparative evaluation of embedding models or HNSW parameters.
- **Not a drop-in SaaS starter.** There is no user authentication, billing, multi-tenancy, or application-layer RBAC.
- **Not a business-logic implementation.** The agent graph contains zero domain-specific prompts or routing rules. It uses a single toy system prompt: `"You are a helpful research assistant."`
- **Not a LangGraph tutorial.** Documentation assumes familiarity with LangGraph concepts; it explains architectural decisions, not LangGraph basics.
- **Not a production deployment guide.** Kubernetes manifests, Helm charts, and cloud-specific infrastructure are out of scope.
- **Not a comprehensive observability platform.** OpenTelemetry spans are emitted per graph node; a full observability backend (Jaeger, Honeycomb, Datadog) is the operator's concern.
- **Not a Neo4j schema design reference.** The graph schema is intentionally generic (`:Concept`, `:Fact`, `:Session` nodes) to avoid domain leakage.

---

## 3. Repository Structure

```
agent-native-monorepo/
├── .agents/
│   ├── graph-author.md
│   ├── memory-author.md
│   ├── reviewer.md
│   └── test-author.md
├── .context/
│   ├── architecture.md
│   ├── conventions.md
│   ├── glossary.md
│   └── workflows.md
├── .github/
│   └── workflows/
│       ├── agent-eval.yml
│       ├── ci.yml
│       ├── e2e.yml
│       └── release.yml
├── apps/
│   ├── agent-service/
│   │   ├── src/
│   │   │   ├── agent/
│   │   │   │   ├── graph/
│   │   │   │   │   ├── edges.ts
│   │   │   │   │   ├── graph.ts
│   │   │   │   │   └── state.ts
│   │   │   │   ├── nodes/
│   │   │   │   │   ├── act.node.ts
│   │   │   │   │   ├── egress.node.ts
│   │   │   │   │   ├── ingress.node.ts
│   │   │   │   │   ├── plan.node.ts
│   │   │   │   │   ├── reflect.node.ts
│   │   │   │   │   └── retrieve.node.ts
│   │   │   │   └── agent.module.ts
│   │   │   ├── common/
│   │   │   │   ├── filters/
│   │   │   │   │   └── http-exception.filter.ts
│   │   │   │   ├── interceptors/
│   │   │   │   │   ├── audit.interceptor.ts
│   │   │   │   │   └── logging.interceptor.ts
│   │   │   │   └── pipes/
│   │   │   │       └── zod-validation.pipe.ts
│   │   │   ├── runs/
│   │   │   │   ├── runs.controller.ts
│   │   │   │   ├── runs.module.ts
│   │   │   │   └── runs.service.ts
│   │   │   ├── app.module.ts
│   │   │   └── main.ts
│   │   ├── test/
│   │   │   ├── fixtures/
│   │   │   │   └── run-fixture-001.json
│   │   │   └── runs.e2e-spec.ts
│   │   ├── Dockerfile
│   │   ├── jest.config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── console/
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── RunForm.tsx
│   │   │   │   ├── RunInspector.tsx
│   │   │   │   └── StreamViewer.tsx
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vite.config.ts
│   └── gateway/
│       ├── src/
│       │   ├── middleware/
│       │   │   └── correlation-id.middleware.ts
│       │   ├── routes/
│       │   │   └── runs.route.ts
│       │   └── server.ts
│       ├── package.json
│       └── tsconfig.json
├── mcp-config/
│   ├── filesystem.json
│   ├── neo4j.json
│   ├── postgres.json
│   └── sequential-thinking.json
├── packages/
│   ├── agent-contracts/
│   │   ├── src/
│   │   │   ├── run-request.schema.ts
│   │   │   ├── run-response.schema.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── eslint-config/
│   │   ├── index.js
│   │   └── package.json
│   ├── memory-core/
│   │   ├── src/
│   │   │   ├── episodic/
│   │   │   │   ├── schema.ts          (Drizzle table definitions)
│   │   │   │   ├── episodic.repo.ts
│   │   │   │   └── index.ts
│   │   │   ├── semantic/
│   │   │   │   ├── neo4j/
│   │   │   │   │   ├── neo4j.client.ts
│   │   │   │   │   ├── neo4j.writer.ts
│   │   │   │   │   └── neo4j.reader.ts
│   │   │   │   ├── pgvector/
│   │   │   │   │   ├── pgvector.client.ts
│   │   │   │   │   ├── pgvector.writer.ts
│   │   │   │   │   └── pgvector.reader.ts
│   │   │   │   ├── retrieval-facade.ts
│   │   │   │   └── index.ts
│   │   │   ├── working/
│   │   │   │   ├── working-memory.helpers.ts
│   │   │   │   └── index.ts
│   │   │   └── index.ts               (unified facade export)
│   │   ├── test/
│   │   │   ├── episodic.integration.test.ts
│   │   │   ├── semantic.integration.test.ts
│   │   │   └── retrieval-facade.integration.test.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── shared-types/
│   │   ├── src/
│   │   │   ├── common.schema.ts
│   │   │   ├── memory.schema.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── telemetry/
│   │   ├── src/
│   │   │   ├── otel.setup.ts
│   │   │   ├── logger.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── tsconfig/
│       ├── base.json
│       ├── nestjs.json
│       ├── react.json
│       └── package.json
├── AGENTS.md
├── CLAUDE.md
├── README.md
├── docker-compose.yml
├── package.json              (root; packageManager: "yarn@4.x.x")
├── turbo.json
└── yarn.lock
```

---

## 4. The Three-Brain Memory Architecture

### Overview

The memory system is divided into three tiers with distinct scopes, persistence strategies, and access patterns. All three tiers are exposed through the `packages/memory-core` unified facade.

### 4.1 Working Memory

- **Scope:** Per-run, in-process, ephemeral.
- **Implementation:** The LangGraph `AgentState` object. No external I/O during a run.
- **TTL:** Destroyed at run completion (or crash).
- **Purpose:** Accumulates intermediate reasoning, tool outputs, and retrieved context within a single agent invocation.
- **Helpers (`packages/memory-core/src/working/`):** Pure functions that read from and produce new state slices. No side effects.

```typescript
// packages/memory-core/src/working/working-memory.helpers.ts
import { z } from 'zod';

export const WorkingMemorySchema = z.object({
  runId: z.string().uuid(),
  sessionId: z.string().uuid(),
  correlationId: z.string(),
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'tool']),
      content: z.string(),
    }),
  ),
  retrievedContext: z.array(
    z.object({
      source: z.enum(['neo4j', 'pgvector']),
      score: z.number(),
      content: z.string(),
      entityId: z.string().optional(),
      episodeId: z.string().uuid().optional(),
    }),
  ),
  plan: z.string().optional(),
  toolOutputs: z.array(z.unknown()),
  tokenCounts: z.object({
    prompt: z.number(),
    completion: z.number(),
  }),
  outcome: z.enum(['success', 'error', 'partial']).optional(),
});

export type WorkingMemory = z.infer<typeof WorkingMemorySchema>;

export function seedWorkingMemory(
  input: Pick<WorkingMemory, 'runId' | 'sessionId' | 'correlationId' | 'messages'>,
): WorkingMemory {
  return WorkingMemorySchema.parse({
    ...input,
    retrievedContext: [],
    toolOutputs: [],
    tokenCounts: { prompt: 0, completion: 0 },
  });
}

export function mergeRetrievedContext(
  state: WorkingMemory,
  candidates: WorkingMemory['retrievedContext'],
): WorkingMemory {
  return { ...state, retrievedContext: candidates };
}
```

### 4.2 Episodic Memory

- **Scope:** Session-scoped, persisted across runs.
- **Implementation:** Postgres table managed via Drizzle ORM.
- **TTL:** Configurable via `EPISODE_TTL_DAYS` env var (default: 90 days). A scheduled pruning job deletes rows older than the TTL.
- **Purpose:** Records the full turn history per `session_id`. Provides the raw material for Semantic tier promotion.

```typescript
// packages/memory-core/src/episodic/schema.ts
import { pgTable, uuid, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const episodes = pgTable('episodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull(),
  runId: uuid('run_id').notNull(),
  turnIndex: integer('turn_index').notNull(),
  role: text('role').notNull(), // 'user' | 'assistant' | 'tool'
  content: text('content').notNull(),
  metadata: jsonb('metadata'), // token counts, tool names, etc.
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

```typescript
// packages/memory-core/src/episodic/episodic.repo.ts
import { z } from 'zod';

export const EpisodeFindInputSchema = z.object({
  sessionId: z.string().uuid(),
  limit: z.number().int().positive().default(50),
});
export type EpisodeFindInput = z.infer<typeof EpisodeFindInputSchema>;

export const EpisodeWriteInputSchema = z.object({
  sessionId: z.string().uuid(),
  runId: z.string().uuid(),
  turnIndex: z.number().int().nonnegative(),
  role: z.enum(['user', 'assistant', 'tool']),
  content: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});
export type EpisodeWriteInput = z.infer<typeof EpisodeWriteInputSchema>;

export interface EpisodicRepository {
  write(input: EpisodeWriteInput): Promise<{ id: string }>;
  findBySession(
    input: EpisodeFindInput,
  ): Promise<Array<EpisodeWriteInput & { id: string; createdAt: Date }>>;
}
```

### 4.3 Semantic Memory (Hybrid Store)

The core architectural differentiator. Long-term memory is maintained across **two complementary indices** written atomically by the `reflect` node:

#### 4.3.1 Neo4j 5 Knowledge Graph

- Stores extracted entities and relationships as typed nodes and edges.
- Schema: `(:Concept {id, label, description})`, `(:Session {id})`, `(:Fact {id, text, episodeId, confidence})`
- Edges: `(:Concept)-[:RELATES_TO {type, confidence, episodeId, createdAt}]->(:Concept)`, `(:Session)-[:PRODUCED]->(:Fact)`, `(:Fact)-[:INVOLVES]->(:Concept)`
- All writes use Cypher `MERGE` so they are idempotent and safe to replay on crash recovery.
- Enables symbolic multi-hop graph traversal for explainable recall.

#### 4.3.2 pgvector Collection

- Stores distilled fact embeddings (text-embedding-3-small, 1536 dimensions) in a dedicated Postgres table with the `vector` column type.
- Each row carries a foreign key `episode_id` back to the originating `episodes` row.
- Upsert semantics (keyed on a content hash) make writes idempotent.
- Enables dense semantic similarity search via `<=>` cosine distance operator.

#### 4.3.3 TypeScript Interfaces

```typescript
// packages/memory-core/src/semantic/neo4j/neo4j.writer.ts
import { z } from 'zod';

export const EntityWriteSchema = z.object({
  id: z.string(), // stable semantic ID (e.g., slugified label)
  label: z.string(),
  description: z.string().optional(),
});

export const RelationshipWriteSchema = z.object({
  fromId: z.string(),
  toId: z.string(),
  type: z.string(), // e.g., "RELATES_TO", "CONTRADICTS", "SUPPORTS"
  confidence: z.number().min(0).max(1),
  episodeId: z.string().uuid(),
  createdAt: z.date().default(() => new Date()),
});

export interface Neo4jWriter {
  mergeEntity(entity: z.infer<typeof EntityWriteSchema>): Promise<void>;
  mergeRelationship(rel: z.infer<typeof RelationshipWriteSchema>): Promise<void>;
}
```

```typescript
// packages/memory-core/src/semantic/pgvector/pgvector.writer.ts
import { z } from 'zod';

export const FactUpsertSchema = z.object({
  contentHash: z.string(), // SHA-256 of the distilled fact text
  text: z.string(),
  embedding: z.array(z.number()).length(1536),
  episodeId: z.string().uuid(),
  sessionId: z.string().uuid(),
});

export interface PgvectorWriter {
  upsertFact(fact: z.infer<typeof FactUpsertSchema>): Promise<void>;
}
```

```typescript
// packages/memory-core/src/semantic/retrieval-facade.ts
import { z } from 'zod';

export const RetrievalQuerySchema = z.object({
  queryEmbedding: z.array(z.number()).length(1536),
  seedEntityIds: z.array(z.string()),
  topK: z.number().int().positive().default(10),
  hopDepth: z.number().int().min(1).max(3).default(2),
  sessionId: z.string().uuid().optional(),
});
export type RetrievalQuery = z.infer<typeof RetrievalQuerySchema>;

export const RetrievalCandidateSchema = z.object({
  source: z.enum(['neo4j', 'pgvector']),
  score: z.number(),
  content: z.string(),
  entityId: z.string().optional(),
  episodeId: z.string().uuid().optional(),
});
export type RetrievalCandidate = z.infer<typeof RetrievalCandidateSchema>;

export interface RetrievalFacade {
  retrieve(query: RetrievalQuery): Promise<RetrievalCandidate[]>;
}
```

The `retrieve` implementation performs:

1. Top-K cosine similarity search against pgvector.
2. Bounded multi-hop graph expansion in Neo4j starting from `seedEntityIds`, depth ≤ `hopDepth`.
3. RRF (Reciprocal Rank Fusion) merge and rerank of both candidate sets.
4. Returns the top `topK` merged candidates.

### 4.4 Promotion Rules

| Source Tier                            | Trigger                         | Target Tier                                                                          |
| -------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------ |
| Working Memory (messages, toolOutputs) | `reflect` node fires at run end | Episodic (full turn written per message)                                             |
| Episodic row                           | `reflect` node fires at run end | Semantic: Neo4j MERGE (entities/relationships) AND pgvector upsert (distilled facts) |

**The `reflect` node is the sole writer to Episodic and Semantic.** It performs four idempotent operations in order:

1. Write each Working Memory message to Episodic (`episodes` table).
2. Call the LLM to extract entities and relationships from the session context.
3. `MERGE` each entity and relationship into Neo4j with provenance metadata (`episodeId`, `confidence`, `createdAt`).
4. For each distilled fact, generate an embedding and upsert into pgvector with `episode_id` FK.

Steps 3 and 4 are crash-safe: re-running `reflect` on the same `runId` produces identical Neo4j and pgvector state (idempotent by content hash and Cypher MERGE).

---

## 5. LangGraph State Machine Specification

### 5.1 State Type

```typescript
// apps/agent-service/src/agent/graph/state.ts
import { z } from 'zod';
import { WorkingMemorySchema } from '@repo/memory-core';

export const AgentStateSchema = WorkingMemorySchema.extend({
  // Graph control
  stepCount: z.number().int().nonnegative().default(0),
  maxSteps: z.number().int().positive().default(10),
  shouldContinue: z.boolean().default(true),

  // LLM plan output
  plan: z.string().optional(),

  // Accumulated tool results for reflect
  toolOutputs: z
    .array(
      z.object({
        toolName: z.string(),
        input: z.unknown(),
        output: z.unknown(),
        error: z.string().optional(),
      }),
    )
    .default([]),
});

export type AgentState = z.infer<typeof AgentStateSchema>;
```

### 5.2 Node Specifications

#### `ingress`

- **Purpose:** Validates the inbound `RunRequest`, seeds Working Memory.
- **Input:** Raw HTTP body from the `runs.controller.ts` endpoint.
- **Behavior:** Applies `RunRequestSchema` (Zod parse, throws on failure), calls `seedWorkingMemory()`, sets `runId`, `sessionId`, `correlationId`.
- **Output:** Initial `AgentState`.

#### `retrieve`

- **Purpose:** Hybrid Semantic recall — populates `retrievedContext` before planning.
- **Behavior:**
  1. Embed the user's query (via OpenAI embedding API).
  2. Extract seed entity IDs from the query text using a lightweight NER step.
  3. Call `RetrievalFacade.retrieve({ queryEmbedding, seedEntityIds, topK: 10, hopDepth: 2 })`.
  4. OpenTelemetry spans wrap the pgvector search and Neo4j traversal separately.
  5. Writes merged candidates to `state.retrievedContext`.
- **Output:** `AgentState` with `retrievedContext` populated.

#### `plan`

- **Purpose:** LLM call that produces a structured plan.
- **Behavior:** Constructs a prompt from `state.messages` + `state.retrievedContext`. Calls the LLM with system prompt `"You are a helpful research assistant."`. Writes the plan string to `state.plan`. Increments `state.tokenCounts`.
- **Output:** `AgentState` with `plan` set.

#### `act`

- **Purpose:** Tool-use execution loop, bounded by `maxSteps`.
- **Behavior:** Reads `state.plan`. Invokes bound tools (e.g., web search, calculator — generic stubs). Appends results to `state.toolOutputs`. Increments `state.stepCount`. Sets `state.shouldContinue = false` when plan is complete or `stepCount >= maxSteps`.
- **Output:** `AgentState` with updated `toolOutputs` and `stepCount`.

#### `reflect`

- **Purpose:** Memory consolidation — promotes Working Memory to Episodic and Semantic tiers.
- **Behavior:**
  1. Write all `state.messages` to the Episodic `episodes` table via `EpisodicRepository.write()`.
  2. Call LLM with a distillation prompt to extract (a) entity/relationship triples and (b) distilled facts from the session.
  3. For each entity/relationship: `Neo4jWriter.mergeEntity()` + `Neo4jWriter.mergeRelationship()` with `episodeId`, `confidence`, `createdAt`.
  4. For each distilled fact: generate embedding, `PgvectorWriter.upsertFact()` with `episodeId` FK.
  5. All four operations are idempotent; re-running on the same `runId` is safe.
- **Output:** `AgentState` unchanged (reflect is a side-effect node).

#### `egress`

- **Purpose:** Validates final output, prepares HTTP response.
- **Behavior:** Applies `RunResponseSchema` (Zod parse). Populates `state.outcome`. Constructs the response envelope.
- **Output:** `RunResponse` (not further routed in the graph).

### 5.3 Edge Conditions

```typescript
// apps/agent-service/src/agent/graph/edges.ts
export function shouldContinueActing(state: AgentState): 'act' | 'reflect' {
  if (!state.shouldContinue || state.stepCount >= state.maxSteps) {
    return 'reflect';
  }
  return 'act';
}
```

**Graph topology:**

```
ingress → retrieve → plan → act →[shouldContinueActing]→ act (loop)
                                                        ↘ reflect → egress
```

Compiled as a `StateGraph` with `START` → `ingress` and `egress` → `END`.

### 5.4 NestJS Controller Wiring

```typescript
// apps/agent-service/src/runs/runs.controller.ts
@Controller('runs')
export class RunsController {
  constructor(private readonly runsService: RunsService) {}

  @Post()
  @HttpCode(200)
  async createRun(
    @Body() body: unknown, // validated by global ZodValidationPipe
    @Headers('x-correlation-id') correlationId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RunResponse> {
    return this.runsService.execute({ body, correlationId });
  }

  @Post('stream')
  async streamRun(
    @Body() body: unknown,
    @Headers('x-correlation-id') correlationId: string,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    await this.runsService.stream({ body, correlationId, res });
  }
}
```

- **Request/Response mode:** `POST /runs` — waits for `egress`, returns `RunResponse` JSON.
- **Streaming mode:** `POST /runs/stream` — emits SSE events per node completion, including `data: {"node":"plan","delta":"..."}` events from the LLM plan node.

---

## 6. Cross-Cutting Concerns (NestJS 11 Microservice)

### 6.1 Global ZodValidationPipe

```typescript
// apps/agent-service/src/common/pipes/zod-validation.pipe.ts
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Validation Error',
        issues: result.error.issues,
      });
    }
    return result.data;
  }
}
```

Applied globally in `main.ts`:

```typescript
app.useGlobalPipes(new ZodValidationPipe(RunRequestSchema));
```

### 6.2 Global AuditInterceptor

Logs `run_id`, `session_id`, `duration_ms`, `prompt_tokens`, `completion_tokens`, and `outcome` on every request to the structured logger. Reads token counts from `state.tokenCounts` attached to the request context after graph execution.

```typescript
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = Date.now();
    const req = context.switchToHttp().getRequest();
    return next.handle().pipe(
      tap((data) => {
        logger.info('run.complete', {
          runId: data?.runId,
          sessionId: req.body?.sessionId,
          durationMs: Date.now() - start,
          ...data?.tokenCounts,
          outcome: data?.outcome,
        });
      }),
    );
  }
}
```

### 6.3 Global HttpExceptionFilter

Returns a structured error envelope on all uncaught exceptions:

```json
{
  "statusCode": 500,
  "error": "Internal Server Error",
  "message": "...",
  "runId": "...",
  "correlationId": "..."
}
```

### 6.4 Global LoggingInterceptor

- Generates a `correlationId` (UUID v4) if not provided by the caller via `x-correlation-id` header.
- Attaches `correlationId` to the NestJS `AsyncLocalStorage` context.
- Propagates `correlationId` into the initial `AgentState` at the `ingress` node.
- All structured log lines emitted by any node include `correlationId` from the ALS context.

### 6.5 OpenTelemetry Tracing

Configured in `packages/telemetry/src/otel.setup.ts` using `@opentelemetry/sdk-node`. Instrumentation:

- One **span per graph node** (`agent.node.<name>`), wrapping the full node execution.
- Dedicated child spans inside the `retrieve` node:
  - `memory.pgvector.search` — includes attributes: `topK`, `queryLength`, `resultCount`.
  - `memory.neo4j.expand` — includes attributes: `seedEntityCount`, `hopDepth`, `resultCount`.
- Spans carry `run_id`, `session_id`, and `correlation_id` as span attributes.
- Exporter: OTLP HTTP (configurable via `OTEL_EXPORTER_OTLP_ENDPOINT` env var; defaults to `http://localhost:4318`).

---

## 7. CI/CD Pipeline (.github/workflows/)

### 7.1 `ci.yml` — Lint, Typecheck, Unit Test, Build

**Trigger:** `pull_request` targeting `main`; `push` to `main`.

**Matrix:** Node.js `20.x`, `22.x`.

**Caching:**

- Yarn cache via `actions/cache` keyed on `${{ hashFiles('yarn.lock') }}`.
- Turborepo remote cache via `TURBO_TOKEN` + `TURBO_TEAM` env vars (or local cache fallback).

**Jobs:**

```yaml
jobs:
  ci:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: ['20.x', '22.x']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: 'yarn'
      - run: yarn install --immutable
      - run: yarn turbo lint
      - run: yarn turbo typecheck
      - run: yarn turbo test:unit
      - run: yarn turbo build
```

### 7.2 `e2e.yml` — Integration Tests with Full Docker Stack

**Trigger:** `pull_request` targeting `main`; manual `workflow_dispatch`.

**Matrix:** Node.js `20.x` only (integration tests are slower; no matrix).

**Caching:** Same as `ci.yml`.

**Jobs:**

```yaml
jobs:
  e2e:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_PASSWORD: postgres
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-retries 10
      neo4j:
        image: neo4j:5-community
        env:
          NEO4J_AUTH: neo4j/password
        ports: ['7687:7687']
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20.x'
          cache: 'yarn'
      - run: yarn install --immutable
      - run: yarn turbo build
      - run: yarn turbo test:integration
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/agentdb
          NEO4J_URI: bolt://localhost:7687
          NEO4J_USER: neo4j
          NEO4J_PASSWORD: password
          REDIS_URL: redis://localhost:6379
```

**Mandatory integration test:** `packages/memory-core/test/semantic.integration.test.ts` — verifies the hybrid write/read round-trip: writes entities + embeddings via the reflect sequence, then reads via the retrieval facade and asserts both Neo4j and pgvector contributed candidates.

### 7.3 `release.yml` — Semantic Release + Docker Image Push

**Trigger:** `push` to `main` (post-merge).

**Jobs:**

1. `semantic-release` — uses `@changesets/cli` or `semantic-release`. Bumps versions, generates CHANGELOG, creates GitHub Release.
2. `docker-build-push` — builds Docker images for `apps/agent-service` and `apps/gateway`. Pushes to GHCR (`ghcr.io/${{ github.repository_owner }}/agent-service:${{ steps.release.outputs.version }}`). Uses `docker/build-push-action@v5` with `cache-from: type=gha` and `cache-to: type=gha,mode=max`.

### 7.4 `agent-eval.yml` — LangGraph Regression Suite

**Trigger:** `schedule: cron: '0 3 * * *'` (nightly); manual `workflow_dispatch`.

**Matrix:** Node.js `20.x` only.

**Jobs:**

```yaml
jobs:
  agent-eval:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        ...
      neo4j:
        image: neo4j:5-community
        ...
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20.x'
          cache: 'yarn'
      - run: yarn install --immutable
      - run: yarn turbo build
      - name: Seed Neo4j and pgvector snapshots
        run: node scripts/seed-eval-fixtures.mjs
        env:
          DATABASE_URL: ...
          NEO4J_URI: ...
      - run: yarn turbo test:eval
        env:
          DATABASE_URL: ...
          NEO4J_URI: ...
```

Eval fixtures are stored in `apps/agent-service/test/fixtures/` as JSON files recording full `AgentState` snapshots including `retrievedContext`, `plan`, `toolOutputs`, and `outcome`. The eval suite replays each fixture and asserts output determinism within a configurable similarity threshold.

---

## 8. Agentic Context System

### 8.1 `CLAUDE.md` (Root)

Top-level operator instructions for any Claude agent working in this repository. Contents:

```markdown
# CLAUDE.md — Operator Instructions

This is a production-grade LangGraph + NestJS 11 monorepo. Read .context/architecture.md
before making any changes.

## Key Rules

- All memory writes go through packages/memory-core — never write to Postgres, Neo4j, or
  pgvector directly from app code.
- The reflect node is the ONLY place that promotes data to Episodic or Semantic memory.
- All graph nodes must have a corresponding OTel span. Use the span helpers in
  packages/telemetry.
- All new packages must be added to the Yarn 4 workspaces array in the root package.json.
- Run `yarn turbo typecheck` and `yarn turbo lint` before declaring any task complete.
- See .context/workflows.md for how to add a new graph node, package, or memory adapter.
- See .agents/ for specialized subagent prompts to use for common tasks.
```

### 8.2 `AGENTS.md` (Root)

Generic cross-agent compatibility document — compatible with Cursor, Kilo Code, OpenAI Codex, Continue, Aider, and similar tools. Contents:

```markdown
# AGENTS.md — Cross-Agent Compatibility

This file is the agent-agnostic equivalent of CLAUDE.md. All rules in CLAUDE.md apply.

## Context Files

Always read before starting work:

- .context/architecture.md — what this repo is and why
- .context/conventions.md — code style, naming, commit rules
- .context/workflows.md — step-by-step guides for common tasks
- .context/glossary.md — terminology reference

## Specialized Subagent Prompts

Use the prompts in .agents/ to delegate to a specialized subagent when appropriate:

- .agents/reviewer.md — PR convention review
- .agents/graph-author.md — scaffold new LangGraph nodes
- .agents/memory-author.md — add/modify memory adapters
- .agents/test-author.md — write tests for new code
```

### 8.3 `.context/`

#### `architecture.md`

Explains:

- What the repo is (extraction of production patterns, not a tutorial).
- The Three-Brain memory model with a visual ASCII diagram.
- Why the hybrid Neo4j + pgvector Semantic tier: symbolic traversal catches relational chains that dense search misses; dense search handles paraphrase and synonym variants that exact-match graph traversal misses. The two indices are complementary, not redundant.
- The LangGraph graph topology and why a state machine (rather than a chain) was chosen for fault-tolerance and crash recovery.
- The NestJS 11 microservice architecture and how it hosts the LangGraph graph.

#### `conventions.md`

- TypeScript strict mode everywhere. No `any`. Use `unknown` + Zod parse at boundaries.
- Zod schemas are the source of truth for types. Infer types from schemas, do not duplicate.
- File naming: `kebab-case.ts` for all source files; `PascalCase.tsx` for React components.
- Exports: all packages export through a root `src/index.ts`.
- Commit style: Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`).
- No `console.log`. Use the structured logger from `packages/telemetry`.
- Test files co-located with source (`.test.ts`) for unit tests; separate `test/` directory for integration tests.

#### `workflows.md`

Step-by-step guides:

1. **Add a new graph node:** Create `apps/agent-service/src/agent/nodes/<name>.node.ts`, implement the `(state: AgentState) => Promise<Partial<AgentState>>` signature, add OTel span wrapper, wire into `graph.ts`, add a unit test.
2. **Add a new package:** Create `packages/<name>/`, add `package.json` with `name: "@repo/<name>"`, add to root `package.json` workspaces, extend appropriate `tsconfig/` base.
3. **Add a new memory adapter:** Create the adapter under `packages/memory-core/src/`, implement the relevant interface (`EpisodicRepository`, `Neo4jWriter`, `Neo4jReader`, `PgvectorWriter`, `PgvectorReader`, `RetrievalFacade`), export from `packages/memory-core/src/index.ts`, add integration tests using testcontainers.

#### `glossary.md`

Defines:

- **Working Memory, Episodic Memory, Semantic Memory** — the Three-Brain model.
- **LangGraph node, edge, state, StateGraph, START, END.**
- **Neo4j / Cypher basics:** node, relationship, MERGE, pattern matching.
- **pgvector basics:** `vector` column type, `<=>` cosine distance operator, HNSW index.
- **RRF (Reciprocal Rank Fusion):** the merge/rerank strategy.
- **OTel span, trace, correlation ID.**
- **Run, Session, Turn:** the scoping hierarchy for agent execution.

### 8.4 `.agents/`

#### `reviewer.md`

Subagent prompt for PR convention review. Instructs the agent to check: Conventional Commit messages, Zod schema usage at all boundaries, OTel spans on any new graph node, no direct DB/Neo4j calls outside `memory-core`, no `any` types, no `console.log`, test coverage for new nodes.

#### `graph-author.md`

Subagent prompt for scaffolding new LangGraph nodes. Instructs the agent to read `state.ts`, `graph.ts`, and an existing node file before writing new code. Enforces the OTel span wrapper pattern and the `Partial<AgentState>` return type.

#### `memory-author.md`

Subagent prompt for adding or modifying memory adapters. Instructs the agent to enforce idempotent write semantics on both Neo4j (`MERGE`, never `CREATE`) and pgvector (upsert on `content_hash`, never bare `INSERT`). Must add integration tests using testcontainers that verify replay safety.

#### `test-author.md`

Subagent prompt for writing tests. Specifies: Vitest for `packages/`, Jest + `@nestjs/testing` for `apps/agent-service`, testcontainers for integration tests touching real databases. No mocking of Neo4j or pgvector in integration tests — always use real containers.

### 8.5 `mcp-config/`

#### `postgres.json`

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "DATABASE_URL": "${DATABASE_URL}"
      }
    }
  }
}
```

#### `neo4j.json`

```json
{
  "mcpServers": {
    "neo4j": {
      "command": "npx",
      "args": ["-y", "mcp-neo4j-cypher"],
      "env": {
        "NEO4J_URI": "${NEO4J_URI}",
        "NEO4J_USERNAME": "${NEO4J_USER}",
        "NEO4J_PASSWORD": "${NEO4J_PASSWORD}"
      },
      "_note": "If mcp-neo4j-cypher is unavailable, use the postgres MCP server to inspect the pgvector tables as a fallback. Native Neo4j MCP support is a documented stub pending stable upstream release."
    }
  }
}
```

#### `filesystem.json`

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    }
  }
}
```

#### `sequential-thinking.json`

```json
{
  "mcpServers": {
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    }
  }
}
```

---

## 9. Testing Strategy

### 9.1 Unit Tests (Vitest, all `packages/`)

- Framework: Vitest.
- Co-located with source as `*.test.ts`.
- Cover: Zod schema validation, pure helper functions (`working-memory.helpers.ts`), RRF merge/rerank logic, edge condition functions (`edges.ts`).
- No I/O. All external dependencies are injected and stubbed.
- Run via: `yarn turbo test:unit`.

### 9.2 Service Tests (Jest + @nestjs/testing, `apps/agent-service`)

- Framework: Jest.
- Test the NestJS module in isolation using `@nestjs/testing`'s `Test.createTestingModule()`.
- Cover: controller input validation (ZodValidationPipe), interceptor audit log output, filter error envelope shape.
- The LangGraph graph execution is mocked to return a fixed `AgentState`.
- Run via: `yarn workspace @repo/agent-service test`.

### 9.3 Memory Integration Tests (testcontainers, `packages/memory-core/test/`)

- Framework: Vitest with `@testcontainers/postgresql` and `@testcontainers/neo4j`.
- Each test file spins up real containers:
  - `episodic.integration.test.ts` — verifies `EpisodicRepository.write()` and `findBySession()` round-trips.
  - `semantic.integration.test.ts` — verifies:
    1. `Neo4jWriter.mergeEntity()` + `mergeRelationship()` idempotency (run twice, assert single node in graph).
    2. `PgvectorWriter.upsertFact()` idempotency (run twice, assert single row on `content_hash`).
  - `retrieval-facade.integration.test.ts` — verifies:
    1. Write entities + embeddings (simulating `reflect`).
    2. Call `RetrievalFacade.retrieve()`.
    3. Assert the result set contains candidates from BOTH Neo4j and pgvector.
    4. Assert RRF scores are monotonically decreasing.
- Run via: `yarn turbo test:integration`.

### 9.4 Graph Fixtures (Replay-Based Regression)

- Stored in `apps/agent-service/test/fixtures/` as JSON files.
- Each fixture records a complete `AgentState` snapshot: input, `retrievedContext`, `plan`, `toolOutputs`, `outcome`, Neo4j seed nodes, pgvector seed embeddings.
- The `agent-eval.yml` workflow seeds the databases from the fixture snapshots, then replays the run and asserts output similarity.
- Run via: `yarn turbo test:eval`.

### 9.5 E2E Tests (Playwright, `apps/console`)

- Framework: Playwright.
- Drives the `apps/console` React UI against a locally running stack.
- Test flow: open console → fill in user query form → submit → observe streaming token output → inspect run metadata.
- Asserts: HTTP 200 from gateway, SSE stream starts within 2 seconds, run metadata panel shows `run_id` and `session_id`.
- Requires full `docker-compose.yml` stack running.
- Run via: `yarn turbo test:e2e`.

---

## 10. README Specification

The `README.md` must include the following sections in this order:

### Hero Section

- Large H1 title: `agent-native-monorepo`
- Tagline: `"A production-grade chassis for stateful LangGraph agents, purpose-built for multi-agent development workflows."`
- One-paragraph pitch explaining the repo is a Yarn 4 monorepo containing a NestJS 11 LangGraph microservice with a Three-Brain memory architecture, and that it demonstrates the intersection of monorepo engineering and production agentic systems.

### Architecture Diagram

- A Mermaid `graph TD` diagram showing the full system: `console` → `gateway` → `agent-service` → `LangGraph state machine` → `memory-core` → `Postgres/pgvector` and `Neo4j`.
- A second Mermaid `graph LR` diagram showing the LangGraph node graph: `ingress → retrieve → plan → act → reflect → egress` with the `act` self-loop edge.
- A third Mermaid `graph TD` diagram showing the Three-Brain memory model with arrows for the promotion rules.

### "Why This Exists" Section

Honest framing: this is an extraction of production patterns from a proprietary agentic platform, sanitized for public consumption. It exists to demonstrate architectural thinking in two scarce domains simultaneously: Yarn monorepo tooling and production LangGraph systems with non-trivial memory architecture.

### Quickstart

```bash
git clone https://github.com/<owner>/agent-native-monorepo
cd agent-native-monorepo
yarn install
docker compose up -d
yarn dev
# POST http://localhost:3001/runs
```

### Three-Brain Memory Explanation

- Prose explanation of Working, Episodic, and Semantic tiers.
- Dedicated callout box for the hybrid Neo4j + pgvector Semantic tier.
- Explanation of **why symbolic-plus-dense recall outperforms either alone:**
  - Dense search finds semantically similar facts but cannot follow relational chains.
  - Graph traversal follows explicit relationships but misses paraphrase variants.
  - Together, they provide complementary recall paths that reduce false negatives.

### LangGraph Node Reference

Table: Node name | Purpose | Input state fields | Output state fields | Side effects.

### Contributing + Agent-Authoring Workflow

- Standard fork/PR workflow.
- Reference to `.context/workflows.md` for how to add nodes, packages, memory adapters.
- Reference to `.agents/` for specialized subagent prompts.
- Reference to `AGENTS.md` for cross-tool compatibility notes.

---

## 11. Acceptance Criteria

The following criteria are concrete and testable. All must pass before the repository is considered complete.

1. `yarn install && yarn turbo build` succeeds on a clean clone with Node.js 20.x and Node.js 22.x, producing zero TypeScript errors and zero lint errors.

2. `docker compose up -d` brings the full local stack online (Postgres 16 with pgvector extension, Neo4j 5 Community, Redis 7) and all health checks pass within 120 seconds.

3. `curl -X POST http://localhost:3001/runs -H 'Content-Type: application/json' -d '{"sessionId":"...", "query":"..."}' ` returns HTTP 200 with a valid `RunResponse` JSON body including `runId`, `outcome`, and `tokenCounts`.

4. `curl -X POST http://localhost:3001/runs/stream` returns `Content-Type: text/event-stream` and emits at least one SSE event per graph node.

5. The integration test `packages/memory-core/test/retrieval-facade.integration.test.ts` passes, verifying that after a `reflect`-sequence write, the retrieval facade returns candidates from **both** Neo4j and pgvector in a single merged result set.

6. All four CI workflows (`ci.yml`, `e2e.yml`, `release.yml`, `agent-eval.yml`) pass green on first push to a clean repository.

7. `README.md` renders on GitHub with all three Mermaid diagrams visible and all code blocks formatted correctly.

8. A full-text search of the repository (`git grep -i puretome && git grep -i 'quiet horizons' && git grep -i 'medical'`) returns zero matches.

9. `yarn turbo test:unit && yarn turbo test:integration` both pass with zero failures.

10. The Playwright E2E suite (`yarn turbo test:e2e`) completes a full run end-to-end through the console UI against the local stack.

---

## 12. Sanitization Checklist

The following must not appear anywhere in the repository — in source code, comments, commit messages, documentation, test fixtures, or generated files:

- [ ] No references to `PureTome`, `Puretome`, or `puretome` in any form.
- [ ] No references to `Quiet Horizons` or any real client name.
- [ ] No medical, clinical, diagnostic, or healthcare domain prompts or terminology.
- [ ] No legal, financial, or regulated-domain prompts or terminology.
- [ ] No proprietary system prompts. The only LLM system prompt in the codebase is: `"You are a helpful research assistant."`
- [ ] No real API keys, secrets, or tokens. All env vars reference placeholders (e.g., `your-openai-api-key-here`).
- [ ] No real internal URLs, hostnames, or IP addresses.
- [ ] No references to the operator's real infrastructure, cloud accounts, or internal tooling.
- [ ] No references to real patient data, user PII, or any proprietary datasets.
- [ ] All test fixtures use synthetic, randomly generated data (UUIDs, lorem ipsum, generic entity labels such as "Concept A", "Concept B").
