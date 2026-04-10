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
