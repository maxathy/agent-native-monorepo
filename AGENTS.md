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

## Planned Work

- `docs/prd/README.md` — the backlog index. Every planned change is described here before
  it is built. Read it before proposing new work; the thing you are about to suggest may
  already be a PRD with a decided approach.
- `docs/adr/` — architecture decision records. Do not contradict an accepted record
  without superseding it.

Use `.agents/prd-author.md` when writing or revising a PRD.
