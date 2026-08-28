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
- See .agents/ for specialized subagent prompts to use for common tasks, including
  .agents/prd-author.md for writing or revising a PRD.
- Planned work lives in docs/prd/ and is indexed by docs/prd/README.md. Read the index
  before proposing new work — it may already be a PRD with a decided approach.
- Decisions live in docs/adr/. Do not contradict an accepted record without superseding it.
